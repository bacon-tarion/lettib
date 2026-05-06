"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  loadProjectMemory,
  upsertMemoryFields,
} from "@/lib/memory/queries";
import { isMemoryFieldKey } from "@/lib/memory/fields";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function updateMemoryField(
  projectId: string,
  field: string,
  value: string
): Promise<{ error?: string; updated_at?: string }> {
  if (!isMemoryFieldKey(field)) {
    return { error: `Invalid field: ${field}` };
  }
  const user = await requireUser();
  const { project } = await loadProjectMemory({
    userId: user.id,
    projectId,
  });
  if (!project) return { error: "Project not found" };

  const result = await upsertMemoryFields({
    userId: user.id,
    projectId,
    updates: { [field]: value },
  });
  if (result.error || !result.row) {
    return { error: result.error ?? "Failed to update" };
  }
  revalidatePath(`/projects/${projectId}/memory`);
  revalidatePath(`/projects/${projectId}`);
  return { updated_at: result.row.updated_at };
}

export async function toggleProjectMemory(
  projectId: string,
  enabled: boolean
): Promise<{ error?: string }> {
  const user = await requireUser();
  const sc = createServiceClient();

  const { data: project } = await sc
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || (project as { user_id: string }).user_id !== user.id) {
    return { error: "Project not found" };
  }

  const { error } = await sc
    .from("projects")
    .update({ memory_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", projectId);
  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/memory`);
  revalidatePath(`/projects/${projectId}`);
  return {};
}
