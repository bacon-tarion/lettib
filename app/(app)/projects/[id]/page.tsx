import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { listTeams } from "@/app/(app)/teams/actions";
import {
  ProjectDetailClient,
  type ProjectDetailRecord,
} from "@/components/projects/project-detail-client";
import type { ProjectConnection } from "@/lib/projects/default-chat-model-options";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: row, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !row) notFound();

  const serviceClient = createServiceClient();
  const [teams, { data: connections }] = await Promise.all([
    listTeams(),
    serviceClient
      .from("api_connections")
      .select("provider, status, custom_base_url, custom_model_name")
      .eq("user_id", user.id)
      .in("status", ["connected", "untested"]),
  ]);

  const project = row as ProjectDetailRecord;

  return (
    <ProjectDetailClient
      project={project}
      initialTeams={teams}
      connections={(connections ?? []) as ProjectConnection[]}
    />
  );
}
