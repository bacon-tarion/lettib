"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type Project = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  pinned: boolean;
  archived: boolean;
  memory_enabled: boolean;
  default_ai_team: string;
  /** FK to ai_teams; null = no default team. */
  default_team_id?: string | null;
  default_chat_provider?: string | null;
  default_chat_model?: string | null;
  custom_instructions?: string | null;
  icon?: string | null;
  color?: string | null;
  created_at: string;
  updated_at: string;
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function revalidateProjectPaths(id?: string) {
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/projects/${id}`);
}

export async function createProject(
  _prev: unknown,
  formData: FormData
): Promise<{ error?: string; id?: string }> {
  const name = (formData.get("name") as string).trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const defaultTeamRaw = (formData.get("default_team_id") as string)?.trim() ?? "";
  const default_team_id =
    defaultTeamRaw === "" || defaultTeamRaw === "none" ? null : defaultTeamRaw;
  const chatProv = (formData.get("default_chat_provider") as string)?.trim() || "";
  const chatModel = (formData.get("default_chat_model") as string)?.trim() || "";

  if (!name) return { error: "Project name is required." };

  const { supabase, user } = await requireUser();

  if (default_team_id) {
    const { data: teamRow } = await supabase
      .from("ai_teams")
      .select("id")
      .eq("id", default_team_id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!teamRow) return { error: "That AI team was not found or is not yours." };
  }

  if ((chatProv && !chatModel) || (!chatProv && chatModel)) {
    return { error: "Default chat model must include both provider and model." };
  }

  const insertRow: Record<string, unknown> = {
    user_id: user.id,
    name,
    description,
  };
  if (default_team_id) insertRow.default_team_id = default_team_id;
  if (chatProv && chatModel) {
    insertRow.default_chat_provider = chatProv;
    insertRow.default_chat_model = chatModel;
  }

  const { data, error } = await supabase
    .from("projects")
    .insert(insertRow as never)
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidateProjectPaths();
  return { id: (data as { id: string }).id };
}

export async function updateProject(
  id: string,
  updates: Partial<
    Pick<
      Project,
      | "name"
      | "description"
      | "pinned"
      | "archived"
      | "memory_enabled"
      | "default_ai_team"
      | "default_team_id"
      | "default_chat_provider"
      | "default_chat_model"
      | "custom_instructions"
      | "icon"
      | "color"
    >
  >
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("projects")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidateProjectPaths(id);
  return {};
}

export async function deleteProject(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidateProjectPaths(id);
  redirect("/projects");
}

export async function archiveProject(
  id: string,
  archived: boolean
): Promise<{ error?: string }> {
  return updateProject(id, { archived });
}

export async function toggleMemory(
  id: string,
  memory_enabled: boolean
): Promise<{ error?: string }> {
  return updateProject(id, { memory_enabled });
}

export async function togglePin(
  id: string,
  pinned: boolean
): Promise<{ error?: string }> {
  return updateProject(id, { pinned });
}
