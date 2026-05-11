import { createServiceClient } from "@/lib/supabase/service";
import { getModelDisplayName } from "@/lib/providers/models";

export type RecentActivityKind = "chat" | "compare" | "synthesis";

export type RecentActivityRow = {
  kind: RecentActivityKind;
  id: string;
  title: string;
  subtitle: string;
  updated_at: string;
  href: string;
};

function snippet(text: string, max = 72) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Last `limit` items across chat conversations, compare sessions, and syntheses,
 * merged by recency (uses conversations.updated_at, syntheses.created_at).
 */
export async function fetchRecentActivityMerged(
  userId: string,
  limit = 10
): Promise<RecentActivityRow[]> {
  const sc = createServiceClient();

  const [chatsRes, comparesRes, synthsRes] = await Promise.all([
    sc
      .from("conversations")
      .select(
        "id, title, model, provider, project_id, updated_at, projects(name)"
      )
      .eq("user_id", userId)
      .eq("mode", "chat")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(10),
    sc
      .from("conversations")
      .select("id, title, project_id, updated_at, projects(name)")
      .eq("user_id", userId)
      .eq("mode", "compare")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(10),
    sc
      .from("syntheses")
      .select("id, prompt, tone, cost_usd, created_at, project_id, projects(name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const chats = (chatsRes.data ?? []) as {
    id: string;
    title: string;
    model: string | null;
    provider: string | null;
    project_id: string | null;
    updated_at: string;
    projects: { name: string } | null;
  }[];

  const compares = (comparesRes.data ?? []) as {
    id: string;
    title: string;
    project_id: string | null;
    updated_at: string;
    projects: { name: string } | null;
  }[];

  const compareIds = compares.map((c) => c.id);
  let modelLabelsByConv = new Map<string, string>();
  if (compareIds.length > 0) {
    const { data: mr } = await sc
      .from("model_responses")
      .select("conversation_id, provider, model")
      .in("conversation_id", compareIds);
    const map = new Map<string, Set<string>>();
    for (const row of (mr ?? []) as {
      conversation_id: string;
      provider: string;
      model: string;
    }[]) {
      if (!map.has(row.conversation_id)) map.set(row.conversation_id, new Set());
      map
        .get(row.conversation_id)!
        .add(getModelDisplayName(row.provider, row.model));
    }
    for (const [cid, set] of map) {
      modelLabelsByConv.set(cid, [...set].slice(0, 4).join(", "));
    }
  }

  const synths = (synthsRes.data ?? []) as {
    id: string;
    prompt: string;
    tone: string;
    cost_usd: number;
    created_at: string;
    project_id: string | null;
    projects: { name: string } | null;
  }[];

  const merged: RecentActivityRow[] = [];

  for (const c of chats) {
    const modelLabel =
      c.provider && c.model
        ? getModelDisplayName(c.provider, c.model)
        : "Chat";
    merged.push({
      kind: "chat",
      id: c.id,
      title: c.title || "Chat",
      subtitle: `${modelLabel} · ${c.projects?.name ?? "No project"}`,
      updated_at: c.updated_at,
      href: `/chat?conversation=${encodeURIComponent(c.id)}`,
    });
  }

  for (const c of compares) {
    merged.push({
      kind: "compare",
      id: c.id,
      title: snippet(c.title || "Compare"),
      subtitle: `${modelLabelsByConv.get(c.id) || "Models"} · ${
        c.projects?.name ?? "No project"
      }`,
      updated_at: c.updated_at,
      href: `/compare?c=${encodeURIComponent(c.id)}`,
    });
  }

  for (const s of synths) {
    merged.push({
      kind: "synthesis",
      id: s.id,
      title: snippet(s.prompt),
      subtitle: `${s.tone} · $${Number(s.cost_usd).toFixed(4)} · ${
        s.projects?.name ?? "No project"
      }`,
      updated_at: s.created_at,
      href: `/synthesis/${s.id}`,
    });
  }

  merged.sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  return merged.slice(0, limit);
}
