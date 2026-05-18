import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { streamChat, getServerApiKey } from "@/lib/providers";
import { MEMORY_INJECTION_PROMPT } from "@/lib/prompts/synthesis";
import { FREE_COMPARE_LIMIT } from "@/lib/usage/limits";
import { MAX_COMPARE_PARALLEL_MODELS } from "@/lib/compare/constants";
import { MODELS_CATALOG } from "@/lib/providers/models";
import { calcCompareModelCost } from "@/lib/compare/cost";
import { logUsageAsync } from "@/lib/usage/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Align with per-member compare timeout (Claude Opus can exceed 90s). */
export const maxDuration = 300;

const TONE_MAP: Record<string, string> = {
  professional: "Respond in a professional, polished tone.",
  simple: "Respond in simple, easy-to-understand language.",
  academic: "Respond in a formal academic tone with citations where relevant.",
  friendly: "Respond in a friendly, conversational tone.",
  technical: "Respond with technical precision and detail.",
  persuasive: "Respond in a persuasive, compelling tone.",
};

type ModelSpec = { provider: string; model: string };

type AnthropicUsage = {
  inputTokens: number;
  outputTokens: number;
};

async function streamAnthropicText(input: {
  apiKey: string;
  model: string;
  userContent: string;
  systemPrompt?: string;
  onText: (text: string) => void;
}): Promise<AnthropicUsage> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 4096,
      stream: true,
      ...(input.systemPrompt ? { system: input.systemPrompt } : {}),
      messages: [{ role: "user", content: input.userContent }],
    }),
  });

  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(
      details || `Anthropic stream failed with status ${res.status}`
    );
  }
  if (!res.body) throw new Error("Anthropic stream response had no body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const handleEvent = (raw: string) => {
    const data = raw
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data || data === "[DONE]") return;

    const event = JSON.parse(data) as {
      type?: string;
      error?: { message?: string };
      usage?: { input_tokens?: number; output_tokens?: number };
      message?: {
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      delta?: { type?: string; text?: string };
    };

    if (event.type === "error") {
      throw new Error(event.error?.message ?? "Anthropic stream failed");
    }
    if (typeof event.message?.usage?.input_tokens === "number") {
      inputTokens = event.message.usage.input_tokens;
    }
    if (typeof event.message?.usage?.output_tokens === "number") {
      outputTokens = event.message.usage.output_tokens;
    }
    if (typeof event.usage?.input_tokens === "number") {
      inputTokens = event.usage.input_tokens;
    }
    if (typeof event.usage?.output_tokens === "number") {
      outputTokens = event.usage.output_tokens;
    }
    if (
      event.type === "content_block_delta" &&
      event.delta?.type === "text_delta" &&
      typeof event.delta.text === "string"
    ) {
      input.onText(event.delta.text);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";
    for (const event of events) handleEvent(event);
  }
  buffer += decoder.decode();
  if (buffer.trim()) handleEvent(buffer);

  return { inputTokens, outputTokens };
}

function normalizeModelIds(raw: unknown): ModelSpec[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ModelSpec[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.includes("::")) {
      const idx = item.indexOf("::");
      const provider = item.slice(0, idx).toLowerCase();
      const model = item.slice(idx + 2);
      if (provider && model) out.push({ provider, model });
    } else if (item && typeof item === "object") {
      const o = item as { provider?: unknown; model?: unknown };
      const provider = o.provider != null ? String(o.provider).toLowerCase() : "";
      const model = o.model != null ? String(o.model) : "";
      if (provider && model) out.push({ provider, model });
    }
  }
  if (out.length === 0) return null;
  const seen = new Set<string>();
  return out.filter((m) => {
    const k = `${m.provider}::${m.model}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function catalogHasModel(provider: string, model: string): boolean {
  const catalog = MODELS_CATALOG as Record<string, readonly { id: string }[]>;
  return !!catalog[provider]?.some((m) => m.id === model);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const body = await req.json();
  const {
    prompt,
    project_id,
    tone,
    conversation_id: bodyConversationId,
    retry_position,
    compare_follow_up: rawFollowUp,
    ask_model: rawAskModel,
  } = body as {
    prompt?: string;
    project_id?: string | null;
    tone?: string;
    conversation_id?: string | null;
    retry_position?: number | null;
    compare_follow_up?: boolean;
    /** Session 11: per-model branch — one model, isolated thread context. */
    ask_model?: boolean;
  };

  const modelIds = normalizeModelIds(body.model_ids);
  if (!prompt?.trim() || !modelIds) {
    return new Response(
      JSON.stringify({ error: "prompt and model_ids[] are required" }),
      { status: 400 }
    );
  }

  const isRetry =
    typeof bodyConversationId === "string" &&
    bodyConversationId.length > 0 &&
    typeof retry_position === "number" &&
    retry_position >= 0 &&
    modelIds.length === 1;

  // "Ask this model" branch — Session 11. Must target a single model and
  // an existing compare conversation. The runtime path is otherwise
  // identical to a follow-up (per-model isolated recap via priorByModel)
  // — only the bookkeeping diverges (round_kind = 'branch').
  const isAskModel =
    rawAskModel === true &&
    typeof bodyConversationId === "string" &&
    bodyConversationId.length > 0 &&
    !isRetry &&
    modelIds.length === 1;

  const isFollowUp =
    !isAskModel &&
    rawFollowUp === true &&
    typeof bodyConversationId === "string" &&
    bodyConversationId.length > 0 &&
    !isRetry;

  if (isRetry && (rawFollowUp === true || rawAskModel === true)) {
    return new Response(
      JSON.stringify({ error: "Cannot combine retry with compare_follow_up or ask_model" }),
      { status: 400 }
    );
  }
  if (rawAskModel === true && !isAskModel) {
    return new Response(
      JSON.stringify({
        error:
          "ask_model requires conversation_id and exactly one model in model_ids",
      }),
      { status: 400 }
    );
  }

  if (!isRetry && bodyConversationId && typeof retry_position === "number") {
    return new Response(
      JSON.stringify({
        error:
          "retry requires conversation_id, retry_position, and exactly one model in model_ids",
      }),
      { status: 400 }
    );
  }

  const serviceClient = createServiceClient();

  if (!isRetry && modelIds.length > MAX_COMPARE_PARALLEL_MODELS) {
    return new Response(
      JSON.stringify({
        error: `You can compare at most ${MAX_COMPARE_PARALLEL_MODELS} models at once.`,
        max_models: MAX_COMPARE_PARALLEL_MODELS,
      }),
      { status: 400 }
    );
  }

  // ── Free-tier compare limit ───────────────────────────────────────────────
  const { data: paidConns } = await serviceClient
    .from("api_connections")
    .select("provider")
    .eq("user_id", user.id)
    .in("status", ["connected", "untested"])
    .neq("provider", "groq");
  const isFreeTier = !paidConns || paidConns.length === 0;
  if (isFreeTier && !isRetry) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { count } = await serviceClient
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("action", "compare")
      .gte("created_at", monthStart.toISOString());
    if ((count ?? 0) >= FREE_COMPARE_LIMIT) {
      return new Response(
        JSON.stringify({
          error: "Free tier limit reached. Add your own API keys to continue.",
          limit: FREE_COMPARE_LIMIT,
          used: count,
        }),
        { status: 429 }
      );
    }
  }

  const { data: connections } = await serviceClient
    .from("api_connections")
    .select("provider, vault_secret_id, custom_base_url, status, custom_model_name")
    .eq("user_id", user.id)
    .in("status", ["connected", "untested"]);

  type ConnRow = {
    provider: string;
    vault_secret_id: string;
    custom_base_url: string | null;
    custom_model_name: string | null;
  };
  const connByProvider = new Map<string, ConnRow>();
  for (const c of (connections ?? []) as ConnRow[]) {
    connByProvider.set(c.provider, c);
  }

  for (const m of modelIds) {
    if (m.provider === "custom") {
      const conn = connByProvider.get("custom");
      const expected = conn?.custom_model_name || "custom";
      if (!conn || m.model !== expected) {
        return new Response(
          JSON.stringify({
            error: `Invalid or unconnected custom model: ${m.model}`,
          }),
          { status: 400 }
        );
      }
      continue;
    }
    if (!catalogHasModel(m.provider, m.model)) {
      return new Response(
        JSON.stringify({
          error: `Unknown model ${m.provider}/${m.model}`,
        }),
        { status: 400 }
      );
    }
  }

  // Resolve project
  let resolvedProjectId: string | null = null;
  if (project_id) {
    const { data: ownedProject } = await serviceClient
      .from("projects")
      .select("id")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!ownedProject) {
      return new Response(
        JSON.stringify({ error: "Project not found or not owned by user" }),
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

  let systemPrompt = tone ? (TONE_MAP[tone] ?? "") : "";
  if (project_id && resolvedProjectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("memory_enabled")
      .eq("id", project_id)
      .single();
    if (project?.memory_enabled) {
      const { data: memory } = await supabase
        .from("project_memory")
        .select("*")
        .eq("project_id", project_id)
        .single();
      if (memory) {
        const hasContent =
          memory.project_goal ||
          memory.important_decisions ||
          memory.user_preferences ||
          memory.key_facts ||
          memory.open_questions ||
          memory.next_steps;
        if (hasContent) {
          const memoryText = MEMORY_INJECTION_PROMPT.replace(
            "{{project_goal}}",
            memory.project_goal || "(none)"
          )
            .replace(
              "{{important_decisions}}",
              memory.important_decisions || "(none)"
            )
            .replace(
              "{{user_preferences}}",
              memory.user_preferences || "(none)"
            )
            .replace("{{key_facts}}", memory.key_facts || "(none)")
            .replace("{{open_questions}}", memory.open_questions || "(none)")
            .replace("{{next_steps}}", memory.next_steps || "(none)");
          systemPrompt = memoryText + "\n\n" + systemPrompt;
        }
      }
    }

    const { data: pf } = await serviceClient
      .from("project_files")
      .select("file_name, extracted_text")
      .eq("project_id", project_id)
      .eq("user_id", user.id)
      .not("extracted_text", "is", null);
    const fileRows = (pf ?? []) as {
      file_name: string;
      extracted_text: string;
    }[];
    if (fileRows.length > 0) {
      const filesBlock = fileRows
        .map(
          (f) => `<file name="${f.file_name}">\n${f.extracted_text}\n</file>`
        )
        .join("\n\n");
      systemPrompt = `Attached project files (use as reference context):\n${filesBlock}\n\n${systemPrompt}`;
    }
  }

  let conversationId: string;
  let positions: number[];
  /** Written on new model_responses rows (0 = first compare round). */
  let insertRoundIndex = 0;
  /** Session 11: 'main' for initial/follow-up rounds, 'branch' for ask-this-model. */
  let insertRoundKind: "main" | "branch" = "main";

  /** Retry path captures the existing row's id here; pre-insert below
   *  populates this for the other paths. */
  const retryRowId = { current: null as string | null };

  if (isRetry) {
    const { data: conv, error: convErr } = await serviceClient
      .from("conversations")
      .select("id, user_id, mode")
      .eq("id", bodyConversationId)
      .single();
    if (convErr || !conv || (conv as { user_id: string }).user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
      });
    }
    if ((conv as { mode: string }).mode !== "compare") {
      return new Response(JSON.stringify({ error: "Not a compare conversation" }), {
        status: 400,
      });
    }
    conversationId = bodyConversationId;
    positions = [retry_position!];
    const spec = modelIds[0]!;
    const { data: existingRow } = await serviceClient
      .from("model_responses")
      .select("id, provider, model")
      .eq("conversation_id", conversationId)
      .eq("position", retry_position!)
      .maybeSingle();
    const row = existingRow as { id: string; provider: string; model: string } | null;
    if (
      row &&
      (row.provider !== spec.provider || row.model !== spec.model)
    ) {
      return new Response(
        JSON.stringify({ error: "Model mismatch for retry position" }),
        { status: 400 }
      );
    }
    retryRowId.current = row?.id ?? null;
  } else if (isFollowUp || isAskModel) {
    const { data: conv, error: convErr } = await serviceClient
      .from("conversations")
      .select("id, user_id, mode, project_id")
      .eq("id", bodyConversationId)
      .single();
    if (convErr || !conv || (conv as { user_id: string }).user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
      });
    }
    if ((conv as { mode: string }).mode !== "compare") {
      return new Response(JSON.stringify({ error: "Not a compare conversation" }), {
        status: 400,
      });
    }
    conversationId = bodyConversationId;

    const { data: allocData, error: allocErr } = await serviceClient.rpc(
      "compare_alloc_next_round",
      {
        p_conversation_id: conversationId,
        p_lane_count: modelIds.length,
      }
    );

    if (allocErr || !allocData?.length) {
      return new Response(
        JSON.stringify({
          error: `Failed to allocate compare round (run migration 029?): ${
            allocErr?.message ?? "unknown"
          }`,
        }),
        { status: 500 }
      );
    }

    const allocRow = allocData[0] as {
      round_index: number;
      start_position: number;
    };
    insertRoundIndex = allocRow.round_index;
    insertRoundKind = isAskModel ? "branch" : "main";
    const startPos = allocRow.start_position;

    const { error: msgError } = await serviceClient.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: prompt,
    });
    if (msgError) {
      return new Response(
        JSON.stringify({ error: `Failed to save follow-up: ${msgError.message}` }),
        { status: 500 }
      );
    }

    positions = modelIds.map((_, i) => startPos + i);
  } else {
    const title = prompt.trim().slice(0, 80);
    const { data: conv, error: convError } = await serviceClient
      .from("conversations")
      .insert({
        user_id: user.id,
        project_id: resolvedProjectId,
        title,
        mode: "compare",
        type: "compare",
        provider: modelIds[0]!.provider,
        model: modelIds[0]!.model,
      })
      .select("id")
      .single();

    if (convError || !conv) {
      return new Response(
        JSON.stringify({
          error: convError?.message ?? "Failed to create conversation",
        }),
        { status: 500 }
      );
    }
    conversationId = (conv as { id: string }).id;

    const { error: msgError } = await serviceClient.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: prompt,
    });
    if (msgError) {
      return new Response(
        JSON.stringify({ error: `Failed to save prompt: ${msgError.message}` }),
        { status: 500 }
      );
    }

    positions = modelIds.map((_, i) => i);
    insertRoundIndex = 0;
  }

  /**
   * Session 12: pre-reserve every position for this round at DB-write
   * time, BEFORE we open the SSE stream. Two reasons:
   *
   *   1. If the client cancels (e.g. clicks "Stop waiting on slow
   *      models") and immediately starts a follow-up, the follow-up's
   *      `max(position)` lookup still sees these placeholder rows. The
   *      follow-up therefore picks a startPos above them and stragglers
   *      from the cancelled round can write back into their reserved
   *      slots without ever colliding with the new round's positions.
   *   2. The client receives a `saved` event with the row id as soon as
   *      each lane settles, so synthesis / grading / follow-ups don't
   *      have to wait for the whole stream to close.
   *
   * Retry path: the row already exists (it's what we're retrying), so
   * we just look up its id.
   */
  const idByPosition = new Map<number, string>();

  if (isRetry) {
    if (retryRowId.current) {
      idByPosition.set(positions[0]!, retryRowId.current);
    }
  } else {
    const placeholderRows = modelIds.map((spec, i) => ({
      conversation_id: conversationId,
      provider: spec.provider,
      model: spec.model,
      content: "",
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      latency_ms: 0,
      error: null,
      position: positions[i]!,
      round_index: insertRoundIndex,
      round_kind: insertRoundKind,
    }));
    const { data: inserted, error: insertErr } = await serviceClient
      .from("model_responses")
      .insert(placeholderRows)
      .select("id, position");
    if (insertErr || !inserted) {
      return new Response(
        JSON.stringify({
          error: `Failed to reserve response slots: ${insertErr?.message ?? "unknown"}`,
        }),
        { status: 500 }
      );
    }
    for (const row of inserted as { id: string; position: number }[]) {
      idByPosition.set(row.position, row.id);
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (obj: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
          );
        } catch {
          // controller may be closed
        }
      };

      enqueue({
        type: "meta",
        conversation_id: conversationId,
        is_retry: isRetry,
        is_follow_up: isFollowUp,
      });

      // Per-model isolated thread history. CRITICAL: a model NEVER sees
      // another model's response inside a Compare workspace. This holds for
      // both main follow-ups and "Ask this model" branches; it's how
      // Compare keeps each model independently attributable so Synthesis
      // can later combine them honestly.
      const priorByModel = new Map<
        string,
        { round_index: number; content: string }[]
      >();
      if ((isFollowUp || isAskModel) && insertRoundIndex > 0) {
        // For ask-this-model we only ever care about the single target
        // model's own rows. The narrow filter is both a perf win and an
        // additional safety net — even a bug elsewhere can't leak
        // peer content into the recap.
        const baseQuery = serviceClient
          .from("model_responses")
          .select("provider, model, round_index, content")
          .eq("conversation_id", conversationId)
          .lt("round_index", insertRoundIndex)
          .order("round_index", { ascending: true });

        const { data: allPrior } = isAskModel
          ? await baseQuery
              .eq("provider", modelIds[0]!.provider)
              .eq("model", modelIds[0]!.model)
          : await baseQuery;

        for (const row of (allPrior ?? []) as {
          provider: string;
          model: string;
          round_index: number;
          content: string;
        }[]) {
          const pk = `${row.provider}::${row.model}`;
          if (!priorByModel.has(pk)) priorByModel.set(pk, []);
          priorByModel.get(pk)!.push({
            round_index: row.round_index,
            content: row.content,
          });
        }
      }

      const PER_MEMBER_TIMEOUT_MS = 300_000;

      // Helper: persist + emit `saved` event so the client knows the row's
      // id the moment a lane settles. Without this, the client must wait
      // for the entire SSE stream to close (which waits on the slowest
      // model) before /api/compare/save returns ids — and synthesis /
      // follow-ups can't proceed without ids.
      //
      // Every row is pre-inserted above; this only ever updates.
      const persistAndEmitSaved = async (
        key: string,
        _spec: ModelSpec,
        position: number,
        row: {
          content: string;
          tokens_in: number;
          tokens_out: number;
          cost_usd: number;
          latency_ms: number;
          error: string | null;
        }
      ) => {
        const id = idByPosition.get(position) ?? null;
        if (!id) {
          // Should never happen — pre-insert covers every position. Skip
          // gracefully rather than crash the stream.
          return;
        }
        try {
          await serviceClient
            .from("model_responses")
            .update({
              content: row.content,
              tokens_in: row.tokens_in,
              tokens_out: row.tokens_out,
              cost_usd: row.cost_usd,
              latency_ms: row.latency_ms,
              error: row.error,
            })
            .eq("id", id);
        } catch {
          // Persistence may fail (e.g., RLS, transient DB error). We
          // already emitted the `done`/`error` event so the user sees the
          // content / failure; just skip the `saved` event.
          return;
        }
        enqueue({
          type: "saved",
          key,
          response_id: id,
          status: row.error ? "error" : "ok",
        });
      };

      const runOne = async (spec: ModelSpec, position: number) => {
        const key = `${spec.provider}::${spec.model}::${position}`;
        const startedAt = Date.now();
        const conn = connByProvider.get(spec.provider);

        const priorKey = `${spec.provider}::${spec.model}`;
        const priorSlices = priorByModel.get(priorKey) ?? [];
        let userContent = prompt;
        if ((isFollowUp || isAskModel) && priorSlices.length > 0) {
          const recap = priorSlices
            .sort((a, b) => a.round_index - b.round_index)
            .map(
              (r, i) =>
                `Round ${i + 1} — your prior answer:\n${r.content}`
            )
            .join("\n\n---\n\n");
          userContent = `${recap}\n\n---\n\nNew question:\n${prompt}`;
        }

        let apiKey: string | null = null;
        let baseUrl: string | null = null;

        if (conn) {
          const { data: vaultKey, error: vaultError } = await serviceClient.rpc(
            "lettib_read_secret",
            { p_secret_id: conn.vault_secret_id }
          );
          if (vaultError || !vaultKey) {
            const errMsg = "Could not decrypt API key.";
            enqueue({ type: "error", key, error: errMsg });
            await persistAndEmitSaved(key, spec, position, {
              content: "",
              tokens_in: 0,
              tokens_out: 0,
              cost_usd: 0,
              latency_ms: Date.now() - startedAt,
              error: errMsg,
            });
            return;
          }
          // Vault RPC may return whitespace; Anthropic/OpenAI reject untrimmed keys.
          apiKey =
            typeof vaultKey === "string"
              ? vaultKey.trim()
              : String(vaultKey).trim();
          if (!apiKey) {
            const errMsg = "API key from vault is empty after decrypt.";
            enqueue({ type: "error", key, error: errMsg });
            await persistAndEmitSaved(key, spec, position, {
              content: "",
              tokens_in: 0,
              tokens_out: 0,
              cost_usd: 0,
              latency_ms: Date.now() - startedAt,
              error: errMsg,
            });
            return;
          }
          baseUrl = conn.custom_base_url ?? null;
        } else {
          const raw = getServerApiKey(spec.provider);
          apiKey = raw ? raw.trim() : null;
          if (!apiKey) {
            const msg = `${spec.provider} is not connected. Add a key in Settings.`;
            enqueue({ type: "error", key, error: msg });
            await persistAndEmitSaved(key, spec, position, {
              content: "",
              tokens_in: 0,
              tokens_out: 0,
              cost_usd: 0,
              latency_ms: Date.now() - startedAt,
              error: msg,
            });
            return;
          }
        }

        let accumulated = "";

        const work = async () => {
          enqueue({ type: "start", key });

          let tokensIn = 0;
          let tokensOut = 0;

          if (spec.provider === "anthropic") {
            const usage = await streamAnthropicText({
              apiKey,
              model: spec.model,
              userContent,
              systemPrompt: systemPrompt || undefined,
              onText: (chunk) => {
                accumulated += chunk;
                enqueue({ type: "chunk", key, text: chunk });
              },
            });
            tokensIn = usage.inputTokens;
            tokensOut = usage.outputTokens;
          } else {
            const result = await streamChat({
              provider: spec.provider as
                | "openai"
                | "anthropic"
                | "google"
                | "xai"
                | "groq"
                | "custom",
              model: spec.model,
              apiKey,
              baseUrl: baseUrl ?? undefined,
              messages: [{ role: "user", content: userContent }],
              systemPrompt: systemPrompt || undefined,
            });

            for await (const chunk of result.textStream) {
              accumulated += chunk;
              enqueue({ type: "chunk", key, text: chunk });
            }

            const usage = await result.usage;
            tokensIn = usage?.promptTokens ?? 0;
            tokensOut = usage?.completionTokens ?? 0;
          }
          const latency_ms = Date.now() - startedAt;
          const cost_usd = calcCompareModelCost(
            spec.provider,
            spec.model,
            tokensIn,
            tokensOut
          );

          enqueue({
            type: "done",
            key,
            tokens_in: tokensIn,
            tokens_out: tokensOut,
            latency_ms,
          });

          await persistAndEmitSaved(key, spec, position, {
            content: accumulated,
            tokens_in: tokensIn,
            tokens_out: tokensOut,
            cost_usd,
            latency_ms,
            error: null,
          });

          logUsageAsync(serviceClient, {
            userId: user.id,
            conversationId,
            action: "compare",
            provider: spec.provider,
            model: spec.model,
            tokensIn,
            tokensOut,
            costUsd: cost_usd,
            latencyMs: latency_ms,
          });
        };

        try {
          await work();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Stream failed";
          enqueue({ type: "error", key, error: message });
          await persistAndEmitSaved(key, spec, position, {
            content: accumulated,
            tokens_in: 0,
            tokens_out: 0,
            cost_usd: 0,
            latency_ms: Date.now() - startedAt,
            error: message,
          });
        }
      };

      const tasks = modelIds.map((spec, idx) => {
        const position = isRetry ? positions[0]! : positions[idx]!;
        const key = `${spec.provider}::${spec.model}::${position}`;
        return Promise.race([
          runOne(spec, position),
          new Promise<void>((resolve) => {
            setTimeout(() => {
              enqueue({
                type: "error",
                key,
                error: `Timed out after ${PER_MEMBER_TIMEOUT_MS / 1000}s`,
              });
              resolve();
            }, PER_MEMBER_TIMEOUT_MS);
          }),
        ]);
      });

      await Promise.allSettled(tasks);
      enqueue({ type: "all_done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
