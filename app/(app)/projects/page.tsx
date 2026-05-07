import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mockProjects } from "@/lib/mockData";
import { ProjectsList } from "./projects-list";

export default async function ProjectsPage() {
  if (process.env.MOCK_MODE === "true") {
    return <ProjectsList projects={mockProjects} />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  return <ProjectsList projects={projects ?? []} />;
}
