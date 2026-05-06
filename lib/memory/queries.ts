import { createServiceClient } from "@/lib/supabase/service";
import {
  MEMORY_FIELD_KEYS,
  type MemoryFieldKey,
  type MemoryRow,
} from "./fields";

const EMPTY_MEMORY = (
  projectId: string,
  userId: string,
  iso: string
): MemoryRow => ({
  project_id: projectId,
  user_id: userId,
  project_goal: null,
  important_decisions: null,
  user_preferences: null,
  key_facts: null,
  open_questions: null,
  next_steps: null,
  updated_at: iso,
});

/**
 * Verifies the project belongs to the user. Returns project memory metadata
 * needed by callers (the project's `memory_enabled` flag + the memory row,
 * even if blank).
 */
export async function loadProjectMemory(opts: {
  userId: string;
  projectId: string;
}): Promise<{
  project: { id: string; name: string; memory_enabled: boolean } | null;
  memory: MemoryRow;
}> {
  const { userId, projectId } = opts;
  const sc = createServiceClient();

  const { data: project } = await sc
    .from("projects")
    .select("id, name, memory_enabled, user_id")
    .eq("id", projectId)
    .maybeSingle();

  if (
    !project ||
    (project as { user_id: string }).user_id !== userId
  ) {
    return { project: null, memory: EMPTY_MEMORY(projectId, userId, new Date(0).toISOString()) };
  }

  const { data: memory } = await sc
    .from("project_memory")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  const proj = project as {
    id: string;
    name: string;
    memory_enabled: boolean;
  };

  return {
    project: { id: proj.id, name: proj.name, memory_enabled: proj.memory_enabled },
    memory:
      (memory as MemoryRow | null) ??
      EMPTY_MEMORY(projectId, userId, new Date(0).toISOString()),
  };
}

/**
 * Upsert one or more fields. Caller MUST have already verified ownership of
 * the project. Field keys not in the allowlist are silently ignored.
 */
export async function upsertMemoryFields(opts: {
  userId: string;
  projectId: string;
  updates: Partial<Record<MemoryFieldKey, string | null>>;
}): Promise<{ error?: string; row?: MemoryRow }> {
  const { userId, projectId, updates } = opts;
  const sc = createServiceClient();

  const safe: Partial<Record<MemoryFieldKey, string | null>> = {};
  for (const [k, v] of Object.entries(updates)) {
    if ((MEMORY_FIELD_KEYS as readonly string[]).includes(k)) {
      const trimmed = typeof v === "string" ? v : null;
      safe[k as MemoryFieldKey] =
        trimmed && trimmed.trim().length > 0 ? trimmed : null;
    }
  }

  if (Object.keys(safe).length === 0) {
    return { error: "No valid fields to update" };
  }

  const { data, error } = await sc
    .from("project_memory")
    .upsert(
      {
        project_id: projectId,
        user_id: userId,
        ...safe,
      },
      { onConflict: "project_id" }
    )
    .select("*")
    .single();

  if (error) return { error: error.message };
  return { row: data as MemoryRow };
}
