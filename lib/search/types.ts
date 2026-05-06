export type SearchResultType = "project" | "conversation" | "synthesis";

/**
 * Shape returned by the `search_user_content(search_query text)` Postgres RPC.
 * All fields except `id` and `type` are treated as optional — the route is
 * defensive about what the RPC actually returns so future schema tweaks don't
 * break the UI.
 */
export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  snippet?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  updated_at?: string | null;
  rank?: number | null;
}

export interface GroupedSearchResults {
  query: string;
  total: number;
  projects: SearchResult[];
  conversations: SearchResult[];
  syntheses: SearchResult[];
}

export function hrefForResult(r: SearchResult): string {
  switch (r.type) {
    case "project":
      return `/projects/${r.id}`;
    case "conversation":
      return `/chat/${r.id}`;
    case "synthesis":
      return `/synthesis/${r.id}`;
    default:
      return "/";
  }
}

const VALID_TYPES = new Set<SearchResultType>([
  "project",
  "conversation",
  "synthesis",
]);

/**
 * Normalises whatever the RPC returns into the SearchResult shape and
 * silently drops rows missing required fields.
 */
export function normaliseRow(raw: unknown): SearchResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = String(r.type ?? "") as SearchResultType;
  const id = r.id;
  if (!VALID_TYPES.has(type) || typeof id !== "string" || id.length === 0) {
    return null;
  }
  return {
    id,
    type,
    title:
      typeof r.title === "string" && r.title.length > 0
        ? r.title
        : "(untitled)",
    snippet: typeof r.snippet === "string" ? r.snippet : null,
    project_id: typeof r.project_id === "string" ? r.project_id : null,
    project_name: typeof r.project_name === "string" ? r.project_name : null,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : null,
    rank:
      typeof r.rank === "number"
        ? r.rank
        : r.rank == null
          ? null
          : Number(r.rank),
  };
}

export function groupResults(
  query: string,
  rows: SearchResult[]
): GroupedSearchResults {
  return {
    query,
    total: rows.length,
    projects: rows.filter((r) => r.type === "project"),
    conversations: rows.filter((r) => r.type === "conversation"),
    syntheses: rows.filter((r) => r.type === "synthesis"),
  };
}
