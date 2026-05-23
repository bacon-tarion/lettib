import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    project_ids?: string[];
  };
  const ids = Array.isArray(body.project_ids)
    ? body.project_ids.filter((id): id is string => typeof id === "string")
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "project_ids required" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await serviceClient
      .from("projects")
      .update({ sort_order: i, updated_at: new Date().toISOString() })
      .eq("id", ids[i]!)
      .eq("user_id", user.id);
    if (error) {
      console.error("[projects/reorder] failed:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
