import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { mockProjects } from "@/lib/mockData";
import { listTeams } from "@/app/(app)/teams/actions";
import { ProjectsList } from "./projects-list";
import type { ProjectConnection } from "@/lib/projects/default-chat-model-options";

export const dynamic = "force-dynamic";

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
  const projectRows = projects ?? [];
  const projectIds = projectRows.map((p) => (p as { id: string }).id);

  const chatCountByProject = new Map<string, number>();
  const synthCountByProject = new Map<string, number>();

  if (projectIds.length > 0) {
    const [{ data: chatRows }, { data: synthRows }] = await Promise.all([
      serviceClient
        .from("conversations")
        .select("project_id")
        .eq("user_id", user.id)
        .eq("mode", "chat")
        .is("deleted_at", null)
        .in("project_id", projectIds),
      serviceClient
        .from("syntheses")
        .select("project_id")
        .eq("user_id", user.id)
        .in("project_id", projectIds),
    ]);

    for (const row of chatRows ?? []) {
      const pid = (row as { project_id: string | null }).project_id;
      if (!pid) continue;
      chatCountByProject.set(pid, (chatCountByProject.get(pid) ?? 0) + 1);
    }
    for (const row of synthRows ?? []) {
      const pid = (row as { project_id: string | null }).project_id;
      if (!pid) continue;
      synthCountByProject.set(pid, (synthCountByProject.get(pid) ?? 0) + 1);
    }
  }

  const enriched = projectRows.map((p) => {
    const row = p as {
      id: string;
      default_team_id?: string | null;
    };
    const tid = row.default_team_id;
    return {
      ...p,
      chat_count: chatCountByProject.get(row.id) ?? 0,
      synthesis_count: synthCountByProject.get(row.id) ?? 0,
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
