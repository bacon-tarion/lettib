import { createServiceClient } from "@/lib/supabase/service";
import { MODELS_CATALOG } from "@/lib/providers/models";

export type ConversationSummary = {
  id: string;
  title: string;
  mode: "chat" | "compare";
  provider: string | null;
  model: string | null;
  project_id: string | null;
  project_name: string | null;
  message_count: number;
  cost_usd: number;
  created_at: string;
  updated_at: string;
};

function calcCost(
  provider: string | null,
  model: string | null,
  tin: number,
  tout: number
) {
  if (!provider || !model) return 0;
  const catalog = MODELS_CATALOG as Record<
    string,
    readonly { id: string; cost_in: number; cost_out: number }[]
  >;
  const entry = catalog[provider]?.find((m) => m.id === model);
  if (!entry) return 0;
  return (entry.cost_in * tin) / 1_000_000 + (entry.cost_out * tout) / 1_000_000;
}

/**
 * Fetches the user's conversations (optionally scoped by project) with
 * message_count and cost_usd computed by aggregating messages + model_responses.
 *
 * RLS bypass via service client + explicit `user_id` filter — same pattern as
 * api_connections / ai_teams elsewhere in the codebase.
 */
export async function listConversationsForUser(opts: {
  userId: string;
  projectId?: string | null;
  limit?: number;
}): Promise<ConversationSummary[]> {
  const { userId, projectId, limit } = opts;
  const sc = createServiceClient();

  let query = sc
    .from("conversations")
    .select(
      "id, title, mode, provider, model, project_id, created_at, updated_at, projects(name)"
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (projectId !== undefined && projectId !== null) {
    query = query.eq("project_id", projectId);
  }
  if (limit) query = query.limit(limit);

  const { data: convs, error } = await query;
  if (error || !convs) return [];

  const conversationIds = convs.map((c) => (c as { id: string }).id);
  if (conversationIds.length === 0) return [];

  // Per-conversation message rows (for count + chat-mode cost)
  const { data: messages } = await sc
    .from("messages")
    .select("conversation_id, provider, model, tokens_in, tokens_out")
    .in("conversation_id", conversationIds);

  // Per-conversation compare responses (for compare-mode cost — these don't
  // duplicate the user prompt message)
  const { data: responses } = await sc
    .from("model_responses")
    .select("conversation_id, cost_usd")
    .in("conversation_id", conversationIds);

  const messageCount = new Map<string, number>();
  const messageCost = new Map<string, number>();
  for (const m of (messages ?? []) as {
    conversation_id: string;
    provider: string | null;
    model: string | null;
    tokens_in: number | null;
    tokens_out: number | null;
  }[]) {
    messageCount.set(
      m.conversation_id,
      (messageCount.get(m.conversation_id) ?? 0) + 1
    );
    if (m.provider && m.model) {
      messageCost.set(
        m.conversation_id,
        (messageCost.get(m.conversation_id) ?? 0) +
          calcCost(m.provider, m.model, m.tokens_in ?? 0, m.tokens_out ?? 0)
      );
    }
  }

  const responseCost = new Map<string, number>();
  const responseCount = new Map<string, number>();
  for (const r of (responses ?? []) as {
    conversation_id: string;
    cost_usd: number | null;
  }[]) {
    responseCost.set(
      r.conversation_id,
      (responseCost.get(r.conversation_id) ?? 0) + (r.cost_usd ?? 0)
    );
    responseCount.set(
      r.conversation_id,
      (responseCount.get(r.conversation_id) ?? 0) + 1
    );
  }

  return convs.map((c) => {
    const row = c as unknown as {
      id: string;
      title: string;
      mode: "chat" | "compare";
      provider: string | null;
      model: string | null;
      project_id: string | null;
      created_at: string;
      updated_at: string;
      projects: { name: string } | null;
    };
    return {
      id: row.id,
      title: row.title,
      mode: row.mode,
      provider: row.provider,
      model: row.model,
      project_id: row.project_id,
      project_name: row.projects?.name ?? null,
      message_count:
        (messageCount.get(row.id) ?? 0) + (responseCount.get(row.id) ?? 0),
      cost_usd:
        (messageCost.get(row.id) ?? 0) + (responseCost.get(row.id) ?? 0),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });
}
