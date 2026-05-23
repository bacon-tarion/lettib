import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { listTeams } from "@/app/(app)/teams/actions";
import {
  ProjectsSidebar,
  type SidebarProject,
} from "@/components/projects/projects-sidebar";
import type { ProjectConnection } from "@/lib/projects/default-chat-model-options";

export const dynamic = "force-dynamic";

export default async function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const serviceClient = createServiceClient();
  const [{ data: projects }, teams, { data: connections }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, pinned, color, icon, sort_order")
      .eq("user_id", user.id)
      .eq("archived", false)
      .order("pinned", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("name"),
    listTeams(),
    serviceClient
      .from("api_connections")
      .select("provider, status, custom_base_url, custom_model_name")
      .eq("user_id", user.id)
      .in("status", ["connected", "untested"]),
  ]);

  return (
    <div className="flex flex-col md:flex-row gap-0 -m-4 md:-m-6 min-h-[calc(100vh-3.5rem)]">
      <ProjectsSidebar
        projects={(projects ?? []) as SidebarProject[]}
        teams={teams}
        connections={(connections ?? []) as ProjectConnection[]}
      />
      <div className="flex-1 p-4 md:p-6 overflow-auto">{children}</div>
    </div>
  );
}
