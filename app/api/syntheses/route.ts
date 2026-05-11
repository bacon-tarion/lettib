import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json(
      { error: "project_id is required" },
      { status: 400 }
    );
  }
  const limitParam = parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10);
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitParam) ? limitParam : 100));

  const service = createServiceClient();

  // Verify project ownership before exposing any of its syntheses.
  const { data: project } = await service
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!project || (project as { user_id: string }).user_id !== user.id) {
    // Same code as 'no such project' to avoid leaking existence.
    return NextResponse.json({ syntheses: [] });
  }

  const { data, error } = await service
    .from("syntheses")
    .select(
      "id, prompt, content, provider, model, tone, tokens_in, tokens_out, cost_usd, source_response_ids, score, created_at"
    )
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const idSet = new Set<string>();
  for (const r of rows) {
    for (const id of (r as { source_response_ids: string[] }).source_response_ids ?? []) {
      idSet.add(id);
    }
  }
  const allSourceIds = Array.from(idSet);
  const sourceMeta = new Map<string, { provider: string; model: string }>();
  if (allSourceIds.length > 0) {
    const { data: mr } = await service
      .from("model_responses")
      .select("id, provider, model")
      .in("id", allSourceIds);
    for (const m of (mr ?? []) as { id: string; provider: string; model: string }[]) {
      sourceMeta.set(m.id, { provider: m.provider, model: m.model });
    }
  }

  const syntheses = rows.map((s) => {
    const ids = (s as { source_response_ids: string[] }).source_response_ids ?? [];
    const source_models = ids
      .map((id) => sourceMeta.get(id))
      .filter(Boolean) as { provider: string; model: string }[];
    return { ...s, source_models };
  });

  return NextResponse.json({ syntheses });
}
