import { NextRequest } from "next/server";
import { CoreMessage } from "ai";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { streamChat } from "@/lib/providers";
import { MEMORY_INJECTION_PROMPT } from "@/lib/prompts/synthesis";

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

  const body = await req.json();
  const { messages, provider, model, project_id, conversation_id, tone } =
    body;

  if (!messages || !provider || !model) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      { status: 400 }
    );
  }

  const serviceClient = createServiceClient();

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

  if (vaultError || !apiKey) {
    return new Response(
      JSON.stringify({ error: "Failed to retrieve API key" }),
      { status: 500 }
    );
  }

  let systemPrompt = tone ? (TONE_MAP[tone as string] ?? "") : "";

  if (project_id) {
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
            .replace(
              "{{open_questions}}",
              memory.open_questions || "(none)"
            )
            .replace("{{next_steps}}", memory.next_steps || "(none)");
          systemPrompt = memoryText + "\n\n" + systemPrompt;
        }
      }
    }
  }

  try {
    const result = await streamChat({
      provider: provider as "openai" | "anthropic" | "google" | "xai" | "custom",
      model: model as string,
      apiKey: apiKey as string,
      baseUrl:
        (connection as { custom_base_url: string | null }).custom_base_url ??
        undefined,
      messages: messages as CoreMessage[],
      systemPrompt: systemPrompt || undefined,
    });

    return result.toDataStreamResponse({
      headers: {
        "X-Conversation-Id": (conversation_id as string) || "",
        "X-Project-Id": (project_id as string) || "",
        "X-Provider": provider as string,
        "X-Model": model as string,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Stream failed";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
