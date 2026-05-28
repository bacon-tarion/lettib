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

export async function getProjects(): Promise<Project[]> {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getProject(id: string): Promise<Project | null> {
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error) return null;
  return data;
}

export async function createProject(
  _prev: unknown,
  formData: FormData,
): Promise<{ error?: string; id?: string }> {
  const name = (formData.get("name") as string).trim();
  const description = (formData.get("description") as string | null)?.trim() || null;

  if (!name) return { error: "Project name is required." };

  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: user.id, name, description })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { id: data.id };
}

export async function updateProject(
  id: string,
  updates: Partial<
    Pick<
      Project,
      "name" | "description" | "pinned" | "archived" | "memory_enabled" | "default_ai_team"
    >
  >,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("projects")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  revalidatePath("/dashboard");
  return {};
}

export async function deleteProject(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  redirect("/projects");
}

export async function togglePinProject(id: string, pinned: boolean) {
  return updateProject(id, { pinned });
}

export async function toggleArchiveProject(id: string, archived: boolean) {
  return updateProject(id, { archived });
}
