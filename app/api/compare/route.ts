import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { streamChat, getServerApiKey } from "@/lib/providers";
import { MEMORY_INJECTION_PROMPT } from "@/lib/prompts/synthesis";
import { FREE_COMPARE_LIMIT } from "@/lib/usage/limits";
import { maxCompareModelsForSubscriptionTier } from "@/lib/pricing";
import { MODELS_CATALOG } from "@/lib/providers/models";
import { calcCompareModelCost } from "@/lib/compare/cost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TONE_MAP: Record<string, string> = {
  professional: "Respond in a professional, polished tone.",
  simple: "Respond in simple, easy-to-understand language.",
  academic: "Respond in a formal academic tone with citations where relevant.",
  friendly: "Respond in a friendly, conversational tone.",
  technical: "Respond with technical precision and detail.",
  persuasive: "Respond in a persuasive, compelling tone.",
};

type ModelSpec = { provider: string; model: string };

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
  } = body as {
    prompt?: string;
    project_id?: string | null;
    tone?: string;
    conversation_id?: string | null;
    retry_position?: number | null;
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

  if (!isRetry && bodyConversationId && retry_position !== undefined) {
    return new Response(
      JSON.stringify({
        error:
          "retry requires conversation_id, retry_position, and exactly one model in model_ids",
      }),
      { status: 400 }
    );
  }

  const serviceClient = createServiceClient();

  const { data: profile } = await serviceClient
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .maybeSingle();

  const tier = (profile as { subscription_tier?: string } | null)
    ?.subscription_tier;
  const maxModels = maxCompareModelsForSubscriptionTier(tier);
  if (!isRetry && modelIds.length > maxModels) {
    return new Response(
      JSON.stringify({
        error: `Your plan allows up to ${maxModels} models per compare.`,
        max_models: maxModels,
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
  } else {
    const title = prompt.trim().slice(0, 80);
    const { data: conv, error: convError } = await serviceClient
      .from("conversations")
      .insert({
        user_id: user.id,
        project_id: resolvedProjectId,
        title,
        mode: "compare",
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
      });

      const PER_MEMBER_TIMEOUT_MS = 90_000;

      const runOne = async (spec: ModelSpec, position: number) => {
        const key = `${spec.provider}::${spec.model}::${position}`;
        const startedAt = Date.now();
        const conn = connByProvider.get(spec.provider);

        let apiKey: string | null = null;
        let baseUrl: string | null = null;

        if (conn) {
          const { data: vaultKey, error: vaultError } = await serviceClient.rpc(
            "lettib_read_secret",
            { p_secret_id: conn.vault_secret_id }
          );
          if (vaultError || !vaultKey) {
            const errMsg = "Could not decrypt API key.";
            enqueue({
              type: "error",
              key,
              error: errMsg,
            });
            const latency_ms = Date.now() - startedAt;
            if (isRetry) {
              await serviceClient
                .from("model_responses")
                .update({ error: errMsg, latency_ms })
                .eq("conversation_id", conversationId)
                .eq("position", position);
            } else {
              await serviceClient.from("model_responses").insert({
                conversation_id: conversationId,
                provider: spec.provider,
                model: spec.model,
                content: "",
                tokens_in: 0,
                tokens_out: 0,
                cost_usd: 0,
                latency_ms,
                error: errMsg,
                position,
              });
            }
            return;
          }
          apiKey = vaultKey as string;
          baseUrl = conn.custom_base_url ?? null;
        } else {
          apiKey = getServerApiKey(spec.provider);
          if (!apiKey) {
            const msg = `${spec.provider} is not connected. Add a key in Settings.`;
            enqueue({ type: "error", key, error: msg });
            const latency_ms = Date.now() - startedAt;
            if (isRetry) {
              await serviceClient
                .from("model_responses")
                .update({ error: msg, latency_ms })
                .eq("conversation_id", conversationId)
                .eq("position", position);
            } else {
              await serviceClient.from("model_responses").insert({
                conversation_id: conversationId,
                provider: spec.provider,
                model: spec.model,
                content: "",
                tokens_in: 0,
                tokens_out: 0,
                cost_usd: 0,
                latency_ms,
                error: msg,
                position,
              });
            }
            return;
          }
        }

        let accumulated = "";

        const work = async () => {
          enqueue({ type: "start", key });

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
            messages: [{ role: "user", content: prompt }],
            systemPrompt: systemPrompt || undefined,
          });

          for await (const chunk of result.textStream) {
            accumulated += chunk;
            enqueue({ type: "chunk", key, text: chunk });
          }

          const usage = await result.usage;
          const tokensIn = usage?.promptTokens ?? 0;
          const tokensOut = usage?.completionTokens ?? 0;
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

          if (isRetry) {
            await serviceClient
              .from("model_responses")
              .update({
                content: accumulated,
                tokens_in: tokensIn,
                tokens_out: tokensOut,
                cost_usd,
                latency_ms,
                error: null,
              })
              .eq("conversation_id", conversationId)
              .eq("position", position);
          } else {
            await serviceClient.from("model_responses").insert({
              conversation_id: conversationId,
              provider: spec.provider,
              model: spec.model,
              content: accumulated,
              tokens_in: tokensIn,
              tokens_out: tokensOut,
              cost_usd,
              latency_ms,
              error: null,
              position,
            });
          }

          await serviceClient.from("usage_logs").insert({
            user_id: user.id,
            conversation_id: conversationId,
            action: "compare",
            provider: spec.provider,
            model: spec.model,
            tokens_in: tokensIn,
            tokens_out: tokensOut,
            cost_usd,
            latency_ms,
          });
        };

        try {
          await work();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Stream failed";
          enqueue({ type: "error", key, error: message });
          const latency_ms = Date.now() - startedAt;
          if (isRetry) {
            await serviceClient
              .from("model_responses")
              .update({
                content: accumulated,
                error: message,
                latency_ms,
              })
              .eq("conversation_id", conversationId)
              .eq("position", position);
          } else {
            await serviceClient.from("model_responses").insert({
              conversation_id: conversationId,
              provider: spec.provider,
              model: spec.model,
              content: accumulated,
              tokens_in: 0,
              tokens_out: 0,
              cost_usd: 0,
              latency_ms,
              error: message,
              position,
            });
          }
        }
      };

      const tasks = modelIds.map((spec, idx) => {
        const position = isRetry ? positions[0]! : idx;
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
