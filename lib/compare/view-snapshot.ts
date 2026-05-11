/** Persist last finished Compare UI so returning to /compare can restore results. */
export const COMPARE_VIEW_SNAPSHOT_KEY = "lettib_compare_view_v1";

export type CompareViewSnapshotV1 = {
  version: 1;
  savedAt: number;
  prompt: string;
  selectedProjectId: string;
  selectedTone: string;
  conversationId: string | null;
  responses: Array<{
    key: string;
    position: number;
    provider: string;
    model: string;
    modelLabel: string;
    content: string;
    status: "pending" | "streaming" | "done" | "error";
    error: string | null;
    tokensIn: number;
    tokensOut: number;
    latencyMs?: number;
    scores: {
      accuracy: number;
      clarity: number;
      creativity: number;
      usefulness: number;
      risk: number;
    } | null;
  }>;
};
