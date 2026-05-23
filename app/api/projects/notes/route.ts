import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const { data: project } = await serviceClient
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: note } = await serviceClient
    .from("project_notes")
    .select("content, updated_at")
    .eq("project_id", projectId)
    .maybeSingle();

  return NextResponse.json({
    content: (note as { content?: string } | null)?.content ?? "",
    updated_at: (note as { updated_at?: string } | null)?.updated_at ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    project_id?: string;
    content?: string;
  };
  const projectId = body.project_id;
  const content = typeof body.content === "string" ? body.content : "";

  if (!projectId) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const { data: project } = await serviceClient
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: row, error } = await serviceClient
    .from("project_notes")
    .upsert(
      {
        project_id: projectId,
        user_id: user.id,
        content,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" }
    )
    .select("updated_at")
    .single();

  if (error) {
    console.error("[projects/notes] upsert failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    updated_at: (row as { updated_at: string }).updated_at,
  });
}
