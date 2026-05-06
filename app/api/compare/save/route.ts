import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { MODELS_CATALOG } from "@/lib/providers";
import { buildScoringMessage } from "@/lib/prompts/scoring";

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
};

type ScoreRow = {
  key: string;
  accuracy: number;
  clarity: number;
  creativity: number;
  usefulness: number;
  risk: number;
};

function calcCost(provider: string, model: string, tin: number, tout: number) {
  const catalog = MODELS_CATALOG as Record<
    string,
    readonly { id: string; cost_in: number; cost_out: number }[]
  >;
  const entry = catalog[provider]?.find((m) => m.id === model);
  if (!entry) return 0;
  return (entry.cost_in * tin) / 1_000_000 + (entry.cost_out * tout) / 1_000_000;
}

async function buildModel(
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
    case "custom":
      if (!baseUrl) throw new Error("baseUrl required for custom provider");
      return createOpenAI({ apiKey, baseURL: baseUrl })(model);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
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
    team_id,
    responses,
  } = body as {
    prompt: string;
    project_id?: string | null;
    team_id?: string | null;
    responses: ResponsePayload[];
  };

  if (!prompt || !Array.isArray(responses) || responses.length === 0) {
    return NextResponse.json(
      { error: "prompt and responses are required" },
      { status: 400 }
    );
  }

  const serviceClient = createServiceClient();

  // Resolve project — if client supplied one, verify ownership; else fall back to Inbox.
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

  // Create conversation in compare mode
  const { data: conv, error: convError } = await serviceClient
    .from("conversations")
    .insert({
      user_id: user.id,
      project_id: resolvedProjectId,
      title,
      mode: "compare",
      provider: responses[0].provider,
      model: responses[0].model,
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

  // Insert user prompt as message — fail loudly on error
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

  // Insert each model response — fail loudly on error
  const responseRows = responses.map((r, i) => ({
    conversation_id: conversationId,
    provider: r.provider,
    model: r.model,
    content: r.content || "",
    tokens_in: r.tokens_in || 0,
    tokens_out: r.tokens_out || 0,
    cost_usd: calcCost(r.provider, r.model, r.tokens_in || 0, r.tokens_out || 0),
    latency_ms: r.latency_ms || 0,
    error: r.error ?? null,
    position: i,
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

  // Log each response in usage_logs (skip errored ones)
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
      cost_usd: calcCost(
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

  // Map keys back to inserted row ids for scoring update + client return.
  // Match by `position` (we wrote it deterministically above) — never trust insert
  // return ordering.
  const idByKey = new Map<string, string>();
  const insertedByPosition = new Map<number, string>();
  for (const row of insertedResponses as { id: string; position: number }[]) {
    insertedByPosition.set(row.position, row.id);
  }
  for (let i = 0; i < responses.length; i++) {
    const id = insertedByPosition.get(i);
    if (id) idByKey.set(responses[i].key, id);
  }

  // ── Optional scoring pass ──────────────────────────────────────────────────
  // Use the first successful response's provider+model as the scorer.
  // Pull its API key the same way as the streaming route.
  let scores: ScoreRow[] = [];
  let scoringError: string | null = null;

  const successful = responses.filter((r) => !r.error && r.content?.trim());
  if (successful.length >= 2 && team_id) {
    try {
      const scorerResp = successful[0];
      const { data: scorerConn } = await serviceClient
        .from("api_connections")
        .select("vault_secret_id, custom_base_url")
        .eq("user_id", user.id)
        .eq("provider", scorerResp.provider)
        .in("status", ["connected", "untested"])
        .single();

      if (scorerConn) {
        const { data: apiKey } = await serviceClient.rpc(
          "lettib_read_secret",
          {
            p_secret_id: (scorerConn as { vault_secret_id: string })
              .vault_secret_id,
          }
        );

        if (apiKey) {
          const scoringMessage = buildScoringMessage(
            prompt,
            successful.map((r) => ({
              key: r.key,
              provider: r.provider,
              model: r.model,
              content: r.content,
            }))
          );

          const scorerModel = await buildModel(
            scorerResp.provider,
            scorerResp.model,
            apiKey as string,
            (scorerConn as { custom_base_url: string | null }).custom_base_url
          );

          const result = await generateText({
            model: scorerModel,
            messages: [{ role: "user", content: scoringMessage }],
          });

          // Extract JSON (model might wrap with code fences despite the prompt)
          let jsonText = result.text.trim();
          const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fenceMatch) jsonText = fenceMatch[1].trim();

          const parsed = JSON.parse(jsonText) as { scores: ScoreRow[] };
          if (Array.isArray(parsed.scores)) scores = parsed.scores;

          // Update model_responses rows with scores
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
        }
      }
    } catch (err) {
      scoringError = err instanceof Error ? err.message : "Scoring failed";
    }
  }

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
