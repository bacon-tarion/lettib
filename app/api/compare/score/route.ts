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
import { logUsageAsync } from "@/lib/usage/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * On-demand scoring (Session 11).
 *
 * Compare no longer runs the scoring pass automatically on save — the user
 * must explicitly invoke it via "Grade answer" (single response) or
 * "Grade selected responses" (multi). This route handles both: the caller
 * supplies a list of response_ids (UUIDs, must belong to a Compare
 * conversation owned by the caller), we re-build the scoring prompt over
 * exactly those responses, write `score_*` columns, and return scores by
 * key.
 *
 * Security:
 *   - Ownership re-checked via the conversation's user_id.
 *   - We deliberately never accept client-supplied scores or trust the
 *     `prompt` for picking which rows to read.
 */

type ScoreRow = {
  key: string;
  accuracy: number;
  clarity: number;
  creativity: number;
  usefulness: number;
  risk: number;
};

type ModelResponseRow = {
  id: string;
  conversation_id: string;
  provider: string;
  model: string;
  content: string;
  error: string | null;
  position: number;
  round_index: number;
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

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    conversation_id: conversationId,
    response_ids: rawResponseIds,
  } = body as {
    conversation_id?: string;
    response_ids?: unknown;
  };

  if (typeof conversationId !== "string" || !conversationId) {
    return NextResponse.json(
      { error: "conversation_id is required" },
      { status: 400 }
    );
  }

  const ids = Array.isArray(rawResponseIds)
    ? Array.from(
        new Set(rawResponseIds.filter((v): v is string => typeof v === "string"))
      )
    : [];
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "response_ids[] is required" },
      { status: 400 }
    );
  }
  // Defence in depth: cap the batch so a runaway client can't trigger a
  // huge model call. Compare already caps at 6 models per round; allow
  // a few rounds' worth.
  if (ids.length > 24) {
    return NextResponse.json(
      { error: "Too many response_ids (max 24)" },
      { status: 400 }
    );
  }

  const serviceClient = createServiceClient();

  // 1. Verify the conversation belongs to this user.
  const { data: conv, error: convErr } = await serviceClient
    .from("conversations")
    .select("id, user_id, mode")
    .eq("id", conversationId)
    .single();
  if (convErr || !conv || (conv as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  if ((conv as { mode: string }).mode !== "compare") {
    return NextResponse.json(
      { error: "Not a compare conversation" },
      { status: 400 }
    );
  }

  // 2. Load the requested responses scoped to this conversation. The
  //    conversation_id eq filter + ownership check above prevent cross-
  //    user reads even if the caller supplies foreign UUIDs.
  const { data: rowsRaw } = await serviceClient
    .from("model_responses")
    .select(
      "id, conversation_id, provider, model, content, error, position, round_index"
    )
    .eq("conversation_id", conversationId)
    .in("id", ids);

  const rows = (rowsRaw ?? []) as ModelResponseRow[];
  const usable = rows.filter((r) => !r.error && r.content?.trim());
  if (usable.length === 0) {
    return NextResponse.json(
      { error: "No gradable responses among supplied IDs" },
      { status: 400 }
    );
  }

  // 3. Resolve the user prompt for the LOWEST round_index present in this
  //    batch — that's the original Compare prompt for these responses.
  //    For "Ask this model" branches we still use the main user message
  //    (each follow-up has its own `messages` entry, but the model only
  //    saw the round prompt at insert time).
  const lowestRound = usable.reduce(
    (acc, r) => Math.min(acc, r.round_index ?? 0),
    Number.POSITIVE_INFINITY
  );
  const { data: userMsgs } = await serviceClient
    .from("messages")
    .select("content, created_at")
    .eq("conversation_id", conversationId)
    .eq("role", "user")
    .order("created_at", { ascending: true });
  const promptText =
    ((userMsgs ?? [])[lowestRound] as { content: string } | undefined)?.content ??
    ((userMsgs ?? [])[0] as { content: string } | undefined)?.content ??
    "";

  // 4. Find a usable scorer key — same logic as the legacy save path: try
  //    each response's provider until we find a stored Vault key or a
  //    server-side fallback (Google free tier).
  let scorerProvider: string | null = null;
  let scorerModel: string | null = null;
  let apiKey: string | null = null;
  let baseUrl: string | null = null;

  for (const r of usable) {
    const { data: conn } = await serviceClient
      .from("api_connections")
      .select("vault_secret_id, custom_base_url")
      .eq("user_id", user.id)
      .eq("provider", r.provider)
      .in("status", ["connected", "untested"])
      .maybeSingle();

    if (conn) {
      const { data: vaultKey } = await serviceClient.rpc("lettib_read_secret", {
        p_secret_id: (conn as { vault_secret_id: string }).vault_secret_id,
      });
      if (vaultKey) {
        scorerProvider = r.provider;
        scorerModel = r.model;
        apiKey =
          typeof vaultKey === "string"
            ? vaultKey.trim()
            : String(vaultKey).trim();
        baseUrl = (conn as { custom_base_url: string | null }).custom_base_url;
        if (apiKey) break;
      }
    }

    const serverKey = getServerApiKey(r.provider);
    if (serverKey) {
      scorerProvider = r.provider;
      scorerModel = r.model;
      apiKey = serverKey.trim();
      baseUrl = null;
      break;
    }
  }

  if (!scorerProvider || !scorerModel || !apiKey) {
    return NextResponse.json(
      {
        error:
          "No usable model available to grade these responses. Connect at least one provider in Settings.",
      },
      { status: 400 }
    );
  }

  // 5. Run the scoring pass. The scoring prompt already requires JSON
  //    output keyed by `key`; we mint a stable key per row.
  const idToKey = new Map<string, string>();
  for (const r of usable) idToKey.set(r.id, `${r.provider}::${r.model}::${r.position}`);

  const scoringMessage = buildScoringMessage(
    promptText,
    usable.map((r) => ({
      key: idToKey.get(r.id)!,
      provider: r.provider,
      model: r.model,
      content: r.content,
    }))
  );

  let scores: ScoreRow[] = [];
  let scoringError: string | null = null;

  try {
    const languageModel = await buildLanguageModel(
      scorerProvider,
      scorerModel,
      apiKey,
      baseUrl
    );

    const startedAt = Date.now();
    const result = await generateText({
      model: languageModel,
      messages: [{ role: "user", content: scoringMessage }],
    });
    const latency_ms = Date.now() - startedAt;

    let jsonText = result.text.trim();
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonText = fenceMatch[1].trim();

    const parsed = JSON.parse(jsonText) as { scores: ScoreRow[] };
    if (Array.isArray(parsed.scores)) scores = parsed.scores;

    for (const r of usable) {
      const key = idToKey.get(r.id);
      if (!key) continue;
      const score = scores.find((s) => s.key === key);
      if (!score) continue;
      await serviceClient
        .from("model_responses")
        .update({
          score_accuracy: score.accuracy,
          score_clarity: score.clarity,
          score_creativity: score.creativity,
          score_usefulness: score.usefulness,
          score_risk: score.risk,
        })
        .eq("id", r.id);
    }

    // Log the grading pass as its own usage event so spend dashboards
    // attribute the cost correctly (it does not count as a Compare call).
    const tokens_in = result.usage?.promptTokens ?? 0;
    const tokens_out = result.usage?.completionTokens ?? 0;
    logUsageAsync(serviceClient, {
      userId: user.id,
      conversationId,
      action: "scoring",
      provider: scorerProvider,
      model: scorerModel,
      tokensIn: tokens_in,
      tokensOut: tokens_out,
      latencyMs: latency_ms,
    });
  } catch (err) {
    scoringError = err instanceof Error ? err.message : "Scoring failed";
  }

  return NextResponse.json({
    success: scoringError === null,
    conversation_id: conversationId,
    scores: scores.map((s) => ({
      ...s,
      // Mirror back the response id so the client can apply scores without
      // re-deriving keys.
      response_id:
        Array.from(idToKey.entries()).find(([, k]) => k === s.key)?.[0] ?? null,
    })),
    scoring_error: scoringError,
  });
}
