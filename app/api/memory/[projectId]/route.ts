import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  loadProjectMemory,
  upsertMemoryFields,
} from "@/lib/memory/queries";
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
  for (const [k, v] of Object.entries(body)) {
    if (isMemoryFieldKey(k) && (typeof v === "string" || v === null)) {
      updates[k] = v;
    }
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
