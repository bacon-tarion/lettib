import { createGroq } from "@ai-sdk/groq";
import { groqGenerateText } from "@/lib/providers/groq-retry";
import { createServiceClient } from "@/lib/supabase/service";
import { logUsageAsync } from "@/lib/usage/log";
import { calcCompareModelCost } from "@/lib/compare/cost";
import { loadProjectMemory } from "@/lib/memory/queries";
import { GROQ_SERVER_MODEL } from "@/lib/providers/groq-server";

const EXTRACTOR_PROVIDER = "groq";
const EXTRACTOR_MODEL = GROQ_SERVER_MODEL;

const EXTRACTION_PROMPT = `Review this conversation and extract only information useful for future work on this project. Include: goals, decisions, preferences, key facts, open questions, next steps. Be concise. Return plain text.

Existing project memory:
{{existing}}

New content to review:
{{content}}

Return only the new facts to append (plain text, no markdown fences). If nothing new is worth remembering, return an empty string.`;

async function getGroqApiKey(userId: string): Promise<string | null> {
  const sc = createServiceClient();
  const { data: conn } = await sc
    .from("api_connections")
    .select("vault_secret_id")
    .eq("user_id", userId)
    .eq("provider", "groq")
    .in("status", ["connected", "untested"])
    .maybeSingle();

  if (!conn) return null;

  const { data: apiKey } = await sc.rpc("lettib_read_secret", {
    p_secret_id: (conn as { vault_secret_id: string }).vault_secret_id,
  });
  const trimmed =
    typeof apiKey === "string" ? apiKey.trim() : String(apiKey ?? "").trim();
  return trimmed || null;
}

/**
 * Fire-and-forget memory extraction after chat, compare, or synthesis.
 * Only runs when project memory is enabled for the project.
 */
export function triggerMemoryExtractionAsync(opts: {
  userId: string;
  projectId: string;
  conversationId?: string | null;
  content: string;
}): void {
  void (async () => {
    try {
      const { userId, projectId, conversationId, content } = opts;
      if (!content.trim()) return;

      const { project, memory } = await loadProjectMemory({ userId, projectId });
      if (!project?.memory_enabled) return;

      const groqKey = await getGroqApiKey(userId);
      if (!groqKey) {
        console.error("[memory/extract] no Groq API key for user", userId);
        return;
      }

      const existing =
        (memory.content && memory.content.trim()) ||
        [
          memory.project_goal,
          memory.important_decisions,
          memory.user_preferences,
          memory.key_facts,
          memory.open_questions,
          memory.next_steps,
        ]
          .filter(Boolean)
          .join("\n\n") ||
        "(empty)";

      const prompt = EXTRACTION_PROMPT.replace("{{existing}}", existing).replace(
        "{{content}}",
        content.slice(0, 12000)
      );

      const groq = createGroq({ apiKey: groqKey });
      const result = await groqGenerateText({
        model: groq(EXTRACTOR_MODEL),
        messages: [{ role: "user", content: prompt }],
      });

      const extracted = result.text.trim();
      if (!extracted) return;

      const sc = createServiceClient();
      const newContent = existing === "(empty)"
        ? extracted
        : `${existing}\n\n${extracted}`;

      const { error: upsertErr } = await sc.from("project_memory").upsert(
        {
          project_id: projectId,
          user_id: userId,
          content: newContent.slice(0, 50000),
        },
        { onConflict: "project_id" }
      );

      if (upsertErr) {
        console.error("[memory/extract] upsert failed:", upsertErr);
        return;
      }

      const tokensIn = result.usage?.promptTokens ?? 0;
      const tokensOut = result.usage?.completionTokens ?? 0;
      logUsageAsync(sc, {
        userId,
        conversationId: conversationId ?? null,
        action: "memory_extraction",
        provider: EXTRACTOR_PROVIDER,
        model: EXTRACTOR_MODEL,
        tokensIn,
        tokensOut,
        costUsd: calcCompareModelCost(
          EXTRACTOR_PROVIDER,
          EXTRACTOR_MODEL,
          tokensIn,
          tokensOut
        ),
        latencyMs: 0,
      });
    } catch (err) {
      console.error("[memory/extract] failed:", err);
    }
  })();
}
