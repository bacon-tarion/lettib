import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  loadProjectMemory,
  upsertMemoryFields,
} from "@/lib/memory/queries";
import { createServiceClient } from "@/lib/supabase/service";
import { isMemoryFieldKey, type MemoryFieldKey } from "@/lib/memory/fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { project, memory } = await loadProjectMemory({
    userId: user.id,
    projectId: params.projectId,
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json({ project, memory });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ownership check first
  const { project } = await loadProjectMemory({
    userId: user.id,
    projectId: params.projectId,
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json();
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: Partial<Record<MemoryFieldKey, string | null>> = {};
  let contentUpdate: string | undefined;
  for (const [k, v] of Object.entries(body)) {
    if (k === "content" && typeof v === "string") {
      contentUpdate = v;
      continue;
    }
    if (isMemoryFieldKey(k) && (typeof v === "string" || v === null)) {
      updates[k] = v;
    }
  }

  if (contentUpdate !== undefined) {
    const sc = createServiceClient();
    const { data, error } = await sc
      .from("project_memory")
      .upsert(
        {
          project_id: project.id,
          user_id: user.id,
          content: contentUpdate,
        },
        { onConflict: "project_id" }
      )
      .select("*")
      .single();
    if (error) {
      console.error("[memory] content update failed:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ memory: data });
    }
  }

  if (Object.keys(updates).length === 0 && contentUpdate === undefined) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  if (Object.keys(updates).length === 0) {
    const { memory } = await loadProjectMemory({
      userId: user.id,
      projectId: project.id,
    });
    return NextResponse.json({ memory });
  }

  const result = await upsertMemoryFields({
    userId: user.id,
    projectId: project.id,
    updates,
  });
  if (result.error || !result.row) {
    return NextResponse.json(
      { error: result.error ?? "Failed to update" },
      { status: 400 }
    );
  }
  return NextResponse.json({ memory: result.row });
}
