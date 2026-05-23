import { createServiceClient } from "@/lib/supabase/service";

export type CompareSnapshotRound = {
  round_number: number;
  prompt: string;
  responses: unknown[];
  created_at: string;
};

export async function saveCompareSnapshot(opts: {
  userId: string;
  comparisonId: string;
  roundNumber: number;
  snapshotData: Record<string, unknown>;
}): Promise<void> {
  const sc = createServiceClient();
  const { error } = await sc.from("compare_snapshots").insert({
    comparison_id: opts.comparisonId,
    user_id: opts.userId,
    round_number: opts.roundNumber,
    snapshot_data: opts.snapshotData,
  });
  if (error) {
    console.error("[compare/snapshot] insert failed:", error);
  }
}

export async function listCompareSnapshots(
  comparisonId: string,
  userId: string
): Promise<CompareSnapshotRound[]> {
  const sc = createServiceClient();
  const { data, error } = await sc
    .from("compare_snapshots")
    .select("round_number, snapshot_data, created_at")
    .eq("comparison_id", comparisonId)
    .eq("user_id", userId)
    .order("round_number", { ascending: true });

  if (error) {
    console.error("[compare/snapshot] list failed:", error);
    return [];
  }

  return (data ?? []).map((row) => {
    const r = row as {
      round_number: number;
      snapshot_data: Record<string, unknown>;
      created_at: string;
    };
    const snap = r.snapshot_data ?? {};
    return {
      round_number: r.round_number,
      prompt: String(snap.prompt ?? ""),
      responses: Array.isArray(snap.responses) ? snap.responses : [],
      created_at: r.created_at,
    };
  });
}
