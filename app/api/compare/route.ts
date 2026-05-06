import { NextRequest } from "next/server";
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

type TeamMemberRow = {
  id: string;
  provider: string;
  model: string;
  position: number;
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
  const { prompt, team_id, project_id, tone } = body as {
    prompt?: string;
    team_id?: string;
    project_id?: string | null;
    tone?: string;
  };

  if (!prompt?.trim() || !team_id) {
    return new Response(
      JSON.stringify({ error: "prompt and team_id are required" }),
      { status: 400 }
    );
  }

  const serviceClient = createServiceClient();

  // Fetch team members
  const { data: team, error: teamError } = await serviceClient
    .from("ai_teams")
    .select("id, user_id, name")
    .eq("id", team_id)
    .single();

  if (teamError || !team || (team as { user_id: string }).user_id !== user.id) {
    return new Response(JSON.stringify({ error: "Team not found" }), {
      status: 404,
    });
  }

  const { data: members } = await serviceClient
    .from("ai_team_members")
    .select("id, provider, model, position")
    .eq("ai_team_id", team_id)
    .order("position", { ascending: true });

  const teamMembers = (members ?? []) as TeamMemberRow[];
  if (teamMembers.length === 0) {
    return new Response(
      JSON.stringify({ error: "Team has no members" }),
      { status: 400 }
    );
  }

  // Fetch all api_connections for this user (we'll match by provider per member)
  const { data: connections } = await serviceClient
    .from("api_connections")
    .select("provider, vault_secret_id, custom_base_url, status")
    .eq("user_id", user.id)
    .in("status", ["connected", "untested"]);

  const connByProvider = new Map<
    string,
    { vault_secret_id: string; custom_base_url: string | null }
  >();
  for (const c of (connections ?? []) as {
    provider: string;
    vault_secret_id: string;
    custom_base_url: string | null;
  }[]) {
    connByProvider.set(c.provider, {
      vault_secret_id: c.vault_secret_id,
      custom_base_url: c.custom_base_url,
    });
  }

  // Build optional memory + tone system prompt
  let systemPrompt = tone ? (TONE_MAP[tone] ?? "") : "";
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
            .replace("{{open_questions}}", memory.open_questions || "(none)")
            .replace("{{next_steps}}", memory.next_steps || "(none)");
          systemPrompt = memoryText + "\n\n" + systemPrompt;
        }
      }
    }
  }

  // Stream all members in parallel as SSE
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

      const PER_MEMBER_TIMEOUT_MS = 90_000;

      const runMember = async (m: TeamMemberRow) => {
        const key = `${m.provider}::${m.model}::${m.id}`;
        const startedAt = Date.now();

        const conn = connByProvider.get(m.provider);
        if (!conn) {
          enqueue({
            type: "error",
            key,
            error: `${m.provider} is not connected. Add a key in Settings.`,
          });
          return;
        }

        try {
          const { data: apiKey, error: vaultError } = await serviceClient.rpc(
            "lettib_read_secret",
            { p_secret_id: conn.vault_secret_id }
          );
          if (vaultError || !apiKey) {
            enqueue({
              type: "error",
              key,
              error: "Could not decrypt API key.",
            });
            return;
          }

          enqueue({ type: "start", key });

          const result = await streamChat({
            provider: m.provider as
              | "openai"
              | "anthropic"
              | "google"
              | "xai"
              | "custom",
            model: m.model,
            apiKey: apiKey as string,
            baseUrl: conn.custom_base_url ?? undefined,
            messages: [{ role: "user", content: prompt }],
            systemPrompt: systemPrompt || undefined,
          });

          for await (const chunk of result.textStream) {
            enqueue({ type: "chunk", key, text: chunk });
          }

          const usage = await result.usage;
          enqueue({
            type: "done",
            key,
            tokens_in: usage?.promptTokens ?? 0,
            tokens_out: usage?.completionTokens ?? 0,
            latency_ms: Date.now() - startedAt,
          });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Stream failed";
          enqueue({ type: "error", key, error: message });
        }
      };

      // Race each member against a timeout so one hanging provider can't
      // stall the whole compare session. Orphaned work that finishes after
      // timeout will hit the closed controller's try/catch in `enqueue`.
      const tasks = teamMembers.map((m) => {
        const key = `${m.provider}::${m.model}::${m.id}`;
        return Promise.race([
          runMember(m),
          new Promise<void>((resolve) =>
            setTimeout(() => {
              enqueue({
                type: "error",
                key,
                error: `Timed out after ${PER_MEMBER_TIMEOUT_MS / 1000}s`,
              });
              resolve();
            }, PER_MEMBER_TIMEOUT_MS)
          ),
        ]);
      });

      await Promise.all(tasks);
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
