import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createGroq } from "@ai-sdk/groq";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getServerApiKey } from "@/lib/providers";
import { buildScoringMessage } from "@/lib/prompts/scoring";
import { calcCompareModelCost } from "@/lib/compare/cost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResponsePayload = {
  key: string;
  provider: string;
  model: string;
  content: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  error?: string | null;
  /** Matches model_responses.position (required when positions are not 0..n-1). */
  position?: number;
};

type ScoreRow = {
  key: string;
  accuracy: number;
  clarity: number;
  creativity: number;
  usefulness: number;
  risk: number;
};

async function buildLanguageModel(
  provider: string,
  model: string,
  apiKey: string,
  baseUrl?: string | null
) {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(model);
    case "xai":
      return createXai({ apiKey })(model);
    case "groq":
      return createGroq({ apiKey })(model);
    case "custom":
      if (!baseUrl) throw new Error("baseUrl required for custom provider");
      return createOpenAI({ apiKey, baseURL: baseUrl })(model);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

async function runScoringPass(
  serviceClient: ReturnType<typeof createServiceClient>,
  userId: string,
  prompt: string,
  responses: ResponsePayload[],
  idByKey: Map<string, string>
): Promise<{ scores: ScoreRow[]; scoringError: string | null }> {
  let scores: ScoreRow[] = [];
  let scoringError: string | null = null;

  const successful = responses.filter((r) => !r.error && r.content?.trim());
  if (successful.length < 2) {
    return { scores, scoringError };
  }

  try {
    let scorerResp: ResponsePayload | null = null;
    let apiKey: string | null = null;
    let baseUrl: string | null = null;

    for (const r of successful) {
      const { data: scorerConn } = await serviceClient
        .from("api_connections")
        .select("vault_secret_id, custom_base_url")
        .eq("user_id", userId)
        .eq("provider", r.provider)
        .in("status", ["connected", "untested"])
        .maybeSingle();

      if (scorerConn) {
        const { data: vaultKey } = await serviceClient.rpc("lettib_read_secret", {
          p_secret_id: (scorerConn as { vault_secret_id: string }).vault_secret_id,
        });
        if (vaultKey) {
          scorerResp = r;
          apiKey = vaultKey as string;
          baseUrl = (scorerConn as { custom_base_url: string | null })
            .custom_base_url;
          break;
        }
      }

      const serverKey = getServerApiKey(r.provider);
      if (serverKey) {
        scorerResp = r;
        apiKey = serverKey;
        baseUrl = null;
        break;
      }
    }

    if (!scorerResp || !apiKey) {
      return { scores, scoringError: null };
    }

    const scoringMessage = buildScoringMessage(
      prompt,
      successful.map((r) => ({
        key: r.key,
        provider: r.provider,
        model: r.model,
        content: r.content,
      }))
    );

    const scorerModel = await buildLanguageModel(
      scorerResp.provider,
      scorerResp.model,
      apiKey,
      baseUrl
    );

    const result = await generateText({
      model: scorerModel,
      messages: [{ role: "user", content: scoringMessage }],
    });

    let jsonText = result.text.trim();
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonText = fenceMatch[1].trim();

    const parsed = JSON.parse(jsonText) as { scores: ScoreRow[] };
    if (Array.isArray(parsed.scores)) scores = parsed.scores;

    for (const s of scores) {
      const id = idByKey.get(s.key);
      if (!id) continue;
      await serviceClient
        .from("model_responses")
        .update({
          score_accuracy: s.accuracy,
          score_clarity: s.clarity,
          score_creativity: s.creativity,
          score_usefulness: s.usefulness,
          score_risk: s.risk,
        })
        .eq("id", id);
    }
  } catch (err) {
    scoringError = err instanceof Error ? err.message : "Scoring failed";
  }

  return { scores, scoringError };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    prompt,
    project_id,
    responses,
    conversation_id: existingConversationId,
  } = body as {
    prompt: string;
    project_id?: string | null;
    responses: ResponsePayload[];
    conversation_id?: string | null;
  };

  if (!prompt || !Array.isArray(responses) || responses.length === 0) {
    return NextResponse.json(
      { error: "prompt and responses are required" },
      { status: 400 }
    );
  }

  const serviceClient = createServiceClient();

  // ── Scoring-only: conversation already persisted by POST /api/compare ─────
  if (existingConversationId) {
    const { data: conv, error: convErr } = await serviceClient
      .from("conversations")
      .select("id, user_id, mode")
      .eq("id", existingConversationId)
      .single();

    if (convErr || !conv || (conv as { user_id: string }).user_id !== user.id) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }
    if ((conv as { mode: string }).mode !== "compare") {
      return NextResponse.json({ error: "Not a compare conversation" }, { status: 400 });
    }

    const { data: existingRows, error: rowsErr } = await serviceClient
      .from("model_responses")
      .select("id, position")
      .eq("conversation_id", existingConversationId)
      .order("position", { ascending: true });

    if (rowsErr || !existingRows?.length) {
      return NextResponse.json(
        { error: "No model responses found for this conversation" },
        { status: 400 }
      );
    }

    const idByKey = new Map<string, string>();
    const rows = existingRows as { id: string; position: number }[];
    for (const resp of responses) {
      const pos =
        typeof resp.position === "number"
          ? resp.position
          : parseInt(resp.key.split("::").pop() ?? "-1", 10);
      const row = rows.find((r) => r.position === pos);
      if (row) idByKey.set(resp.key, row.id);
    }

    const { scores, scoringError } = await runScoringPass(
      serviceClient,
      user.id,
      prompt,
      responses,
      idByKey
    );

    return NextResponse.json({
      success: true,
      conversation_id: existingConversationId,
      response_ids: Array.from(idByKey.entries()).map(([key, id]) => ({
        key,
        id,
      })),
      scores,
      scoring_error: scoringError,
    });
  }

  // ── Legacy: create conversation + rows (manual-compare / older clients) ────
  let resolvedProjectId: string | null = null;
  if (project_id) {
    const { data: ownedProject } = await serviceClient
      .from("projects")
      .select("id")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!ownedProject) {
      return NextResponse.json(
        { error: "Project not found or not owned by user" },
        { status: 403 }
      );
    }
    resolvedProjectId = (ownedProject as { id: string }).id;
  } else {
    const { data: inbox } = await serviceClient
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", "Inbox")
      .limit(1)
      .maybeSingle();
    resolvedProjectId = (inbox as { id: string } | null)?.id ?? null;
  }

  const title = prompt.trim().slice(0, 80);

  const { data: conv, error: convError } = await serviceClient
    .from("conversations")
    .insert({
      user_id: user.id,
      project_id: resolvedProjectId,
      title,
      mode: "compare",
      provider: responses[0]!.provider,
      model: responses[0]!.model,
    })
    .select("id")
    .single();

  if (convError || !conv) {
    return NextResponse.json(
      { error: convError?.message ?? "Failed to create conversation" },
      { status: 500 }
    );
  }
  const conversationId = (conv as { id: string }).id;

  const { error: msgError } = await serviceClient.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: prompt,
  });
  if (msgError) {
    return NextResponse.json(
      { error: `Failed to save prompt: ${msgError.message}` },
      { status: 500 }
    );
  }

  const responseRows = responses.map((r, i) => ({
    conversation_id: conversationId,
    provider: r.provider,
    model: r.model,
    content: r.content || "",
    tokens_in: r.tokens_in || 0,
    tokens_out: r.tokens_out || 0,
    cost_usd: calcCompareModelCost(
      r.provider,
      r.model,
      r.tokens_in || 0,
      r.tokens_out || 0
    ),
    latency_ms: r.latency_ms || 0,
    error: r.error ?? null,
    position: typeof r.position === "number" ? r.position : i,
    round_index: 0,
  }));

  const { data: insertedResponses, error: insertError } = await serviceClient
    .from("model_responses")
    .insert(responseRows)
    .select("id, provider, model, position");

  if (insertError || !insertedResponses) {
    return NextResponse.json(
      {
        error: `Failed to save model responses: ${insertError?.message ?? "unknown"}`,
      },
      { status: 500 }
    );
  }

  const usageLogs = responses
    .filter((r) => !r.error)
    .map((r) => ({
      user_id: user.id,
      conversation_id: conversationId,
      action: "compare",
      provider: r.provider,
      model: r.model,
      tokens_in: r.tokens_in || 0,
      tokens_out: r.tokens_out || 0,
      cost_usd: calcCompareModelCost(
        r.provider,
        r.model,
        r.tokens_in || 0,
        r.tokens_out || 0
      ),
      latency_ms: r.latency_ms || 0,
    }));
  if (usageLogs.length > 0) {
    await serviceClient.from("usage_logs").insert(usageLogs);
  }

  const idByKey = new Map<string, string>();
  const insertedByPosition = new Map<number, string>();
  for (const row of insertedResponses as { id: string; position: number }[]) {
    insertedByPosition.set(row.position, row.id);
  }
  for (let i = 0; i < responses.length; i++) {
    const resp = responses[i]!;
    const pos =
      typeof resp.position === "number"
        ? resp.position
        : parseInt(resp.key.split("::").pop() ?? String(i), 10);
    const id = insertedByPosition.get(pos);
    if (id) idByKey.set(resp.key, id);
  }

  const { scores, scoringError } = await runScoringPass(
    serviceClient,
    user.id,
    prompt,
    responses,
    idByKey
  );

  return NextResponse.json({
    success: true,
    conversation_id: conversationId,
    response_ids: Array.from(idByKey.entries()).map(([key, id]) => ({
      key,
      id,
    })),
    scores,
    scoring_error: scoringError,
  });
}
