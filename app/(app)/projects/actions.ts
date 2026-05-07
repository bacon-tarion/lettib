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

  if (!name) return { error: "Project name is required." };

  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: user.id, name, description })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidateProjectPaths();
  return { id: data.id };
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
