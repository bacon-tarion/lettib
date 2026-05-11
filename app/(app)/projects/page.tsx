import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { mockProjects } from "@/lib/mockData";
import { listTeams } from "@/app/(app)/teams/actions";
import { ProjectsList } from "./projects-list";
import type { ProjectConnection } from "@/lib/projects/default-chat-model-options";

export default async function ProjectsPage() {
  if (process.env.MOCK_MODE === "true") {
    return <ProjectsList projects={mockProjects} teams={[]} connections={[]} />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const serviceClient = createServiceClient();

  const [{ data: projects }, teams, { data: connections }] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false }),
    listTeams(),
    serviceClient
      .from("api_connections")
      .select("provider, status, custom_base_url, custom_model_name")
      .eq("user_id", user.id)
      .in("status", ["connected", "untested"]),
  ]);

  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
  const enriched = (projects ?? []).map((p) => {
    const tid = (p as { default_team_id?: string | null }).default_team_id;
    return {
      ...p,
      default_team_display: tid ? teamNameById.get(tid) ?? undefined : undefined,
    };
  });

  return (
    <ProjectsList
      projects={enriched}
      teams={teams}
      connections={(connections ?? []) as ProjectConnection[]}
    />
  );
}
