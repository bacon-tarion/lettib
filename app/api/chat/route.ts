import { NextRequest } from "next/server";
import { CoreMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { streamChat } from "@/lib/providers";
import {
  fetchGroqKeyForUser,
  streamWebSearchChatResponse,
} from "@/lib/providers/web-search-stream";
import { MODELS_CATALOG } from "@/lib/providers/models";
import { MEMORY_INJECTION_PROMPT } from "@/lib/prompts/synthesis";
import { logUsageAsync } from "@/lib/usage/log";

type ProviderName =
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "groq"
  | "custom";

const VALID_PROVIDERS = new Set<ProviderName>([
  "openai",
  "anthropic",
  "google",
  "xai",
  "groq",
  "custom",
]);

function catalogHas(provider: string, model: string): boolean {
  const catalog = MODELS_CATALOG as Record<string, readonly { id: string }[]>;
  return !!catalog[provider]?.some((m) => m.id === model);
}

function isValidMessages(v: unknown): v is CoreMessage[] {
  return (
    Array.isArray(v) &&
    v.every(
      (m) =>
        m &&
        typeof m === "object" &&
        typeof (m as { role?: unknown }).role === "string" &&
        ["user", "assistant", "system"].includes(
          (m as { role: string }).role
        ) &&
        ((m as { content?: unknown }).content === undefined ||
          typeof (m as { content: unknown }).content === "string" ||
          Array.isArray((m as { content: unknown }).content))
    )
  );
}

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

  let body: {
    messages?: unknown;
    provider?: unknown;
    model?: unknown;
    project_id?: unknown;
    conversation_id?: unknown;
    tone?: unknown;
    web_search?: unknown;
    file_context?: unknown;
    images?: unknown;
    project_file_ids?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
    });
  }

  const provider =
    typeof body.provider === "string"
      ? (body.provider.toLowerCase() as ProviderName)
      : ("" as ProviderName);
  const model = typeof body.model === "string" ? body.model : "";
  const projectId =
    typeof body.project_id === "string" && body.project_id.length > 0
      ? body.project_id
      : null;
  const conversationId =
    typeof body.conversation_id === "string" && body.conversation_id.length > 0
      ? body.conversation_id
      : null;
  const tone = typeof body.tone === "string" ? body.tone : null;
  const webSearch = body.web_search === true;
  const fileContext =
    typeof body.file_context === "string" ? body.file_context : "";
  const images = Array.isArray(body.images)
    ? (body.images as { name?: string; imageBase64?: string }[]).filter(
        (i) => i?.imageBase64
      )
    : [];
  const projectFileIds = Array.isArray(body.project_file_ids)
    ? (body.project_file_ids as unknown[]).filter(
        (id): id is string => typeof id === "string" && id.length > 0
      )
    : [];
  let messages = body.messages as CoreMessage[];

  if (!isValidMessages(messages) || !provider || !model) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      { status: 400 }
    );
  }
  if (!VALID_PROVIDERS.has(provider)) {
    return new Response(JSON.stringify({ error: "Invalid provider" }), {
      status: 400,
    });
  }
  if (provider !== "custom" && !catalogHas(provider, model)) {
    return new Response(JSON.stringify({ error: "Unknown model" }), {
      status: 400,
    });
  }

  const serviceClient = createServiceClient();

  // If conversation_id is supplied, verify it belongs to this user.
  if (conversationId) {
    const { data: existing } = await serviceClient
      .from("conversations")
      .select("user_id, deleted_at")
      .eq("id", conversationId)
      .maybeSingle();
    const row = existing as
      | { user_id: string; deleted_at: string | null }
      | null;
    if (!row || row.user_id !== user.id || row.deleted_at) {
      return new Response(
        JSON.stringify({ error: "Conversation not found" }),
        { status: 404 }
      );
    }
  }

  // If project_id is supplied, verify ownership before injecting project context.
  if (projectId) {
    const { data: ownedProject } = await serviceClient
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!ownedProject) {
      return new Response(
        JSON.stringify({ error: "Project not found or not owned by user" }),
        { status: 403 }
      );
    }
  }

  const { data: connection, error: connError } = await serviceClient
    .from("api_connections")
    .select("vault_secret_id, custom_base_url")
    .eq("user_id", user.id)
    .eq("provider", provider)
    .in("status", ["connected", "untested"])
    .single();

  if (connError || !connection) {
    return new Response(
      JSON.stringify({
        error: "Provider not connected. Add an API key in Settings first.",
      }),
      { status: 400 }
    );
  }

  const { data: apiKey, error: vaultError } = await serviceClient.rpc(
    "lettib_read_secret",
    { p_secret_id: (connection as { vault_secret_id: string }).vault_secret_id }
  );

  const trimmedKey =
    typeof apiKey === "string" ? apiKey.trim() : String(apiKey ?? "").trim();
  if (vaultError || !trimmedKey) {
    return new Response(
      JSON.stringify({ error: "Failed to retrieve API key" }),
      { status: 500 }
    );
  }

  let systemPrompt = tone ? (TONE_MAP[tone] ?? "") : "";

  if (projectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("memory_enabled, custom_instructions")
      .eq("id", projectId)
      .single();

    if (project?.custom_instructions) {
      systemPrompt =
        `Project custom instructions:\n${project.custom_instructions}\n\n` +
        systemPrompt;
    }

    if (project?.memory_enabled) {
      const { data: memory } = await supabase
        .from("project_memory")
        .select("*")
        .eq("project_id", projectId)
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
            .replace(
              "{{open_questions}}",
              memory.open_questions || "(none)"
            )
            .replace("{{next_steps}}", memory.next_steps || "(none)");
          systemPrompt = memoryText + "\n\n" + systemPrompt;
        }
      }
    }

    // Inject selected or all project files
    let fileQuery = serviceClient
      .from("project_files")
      .select("id, file_name, extracted_text")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .not("extracted_text", "is", null);
    if (projectFileIds.length > 0) {
      fileQuery = fileQuery.in("id", projectFileIds);
    }
    const { data: pf } = await fileQuery;
    const fileRows = (pf ?? []) as { file_name: string; extracted_text: string }[];
    if (fileRows.length > 0) {
      const filesBlock = fileRows
        .map((f) => `<file name="${f.file_name}">\n${f.extracted_text}\n</file>`)
        .join("\n\n");
      systemPrompt = `Attached project files (use as reference context):\n${filesBlock}\n\n${systemPrompt}`;
    }
  }

  if (fileContext && messages.length > 0) {
    const lastIdx = messages.length - 1;
    const last = messages[lastIdx];
    if (last && last.role === "user") {
      const base =
        typeof last.content === "string"
          ? last.content
          : Array.isArray(last.content)
            ? last.content
                .filter((p) => p.type === "text")
                .map((p) => (p as { text: string }).text)
                .join("\n")
            : "";
      messages = [
        ...messages.slice(0, lastIdx),
        { ...last, content: base + fileContext },
      ];
    }
  }

  if (images.length > 0 && messages.length > 0) {
    const lastIdx = messages.length - 1;
    const last = messages[lastIdx];
    if (last && last.role === "user") {
      type Part =
        | { type: "text"; text: string }
        | { type: "image"; image: string };
      const parts: Part[] = [
        {
          type: "text",
          text:
            typeof last.content === "string"
              ? last.content
              : "See attached images.",
        },
      ];
      for (const img of images) {
        if (img.imageBase64) {
          parts.push({ type: "image", image: img.imageBase64 });
        }
      }
      messages = [...messages.slice(0, lastIdx), { ...last, content: parts }];
    }
  }

  try {
    const startedAt = Date.now();
    const streamHeaders = {
      "X-Conversation-Id": conversationId || "",
      "X-Project-Id": projectId || "",
      "X-Provider": provider,
      "X-Model": model,
    };

    if (webSearch) {
      const groqApiKey =
        provider === "xai"
          ? await fetchGroqKeyForUser(serviceClient, user.id)
          : null;
      const onFinish = (usage: {
        promptTokens?: number;
        completionTokens?: number;
      }) => {
        logUsageAsync(serviceClient, {
          userId: user.id,
          conversationId,
          action: "chat",
          provider,
          model,
          tokensIn: usage.promptTokens,
          tokensOut: usage.completionTokens,
          latencyMs: Date.now() - startedAt,
        });
        logUsageAsync(serviceClient, {
          userId: user.id,
          conversationId,
          action: "web_search",
          provider,
          model,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          latencyMs: 0,
        });
      };

      return await streamWebSearchChatResponse(
        {
          provider,
          model,
          apiKey: trimmedKey,
          groqApiKey,
          messages,
          systemPrompt: systemPrompt || undefined,
          onFinish,
        },
        streamHeaders
      );
    }

    const result = await streamChat({
      provider,
      model,
      apiKey: trimmedKey,
      baseUrl:
        (connection as { custom_base_url: string | null }).custom_base_url ??
        undefined,
      messages,
      systemPrompt: systemPrompt || undefined,
      onFinish: ({ usage }) => {
        logUsageAsync(serviceClient, {
          userId: user.id,
          conversationId,
          action: "chat",
          provider,
          model,
          tokensIn: usage?.promptTokens,
          tokensOut: usage?.completionTokens,
          latencyMs: Date.now() - startedAt,
        });
      },
    });

    return result.toDataStreamResponse({
      headers: {
        "X-Conversation-Id": conversationId || "",
        "X-Project-Id": projectId || "",
        "X-Provider": provider,
        "X-Model": model,
      },
    });
  } catch (err: unknown) {
    // Don't echo raw provider error messages (may include sensitive payloads
    // or stack details). Log server-side, return generic message to the client.
    console.error("[/api/chat] stream failed:", err);
    return new Response(
      JSON.stringify({ error: "Failed to start chat stream." }),
      { status: 500 }
    );
  }
}
