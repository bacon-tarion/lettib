import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isGroqBuiltinEnabled } from "@/lib/builtin-providers";
import { CompareUI } from "@/components/compare/compare-ui";

export const dynamic = "force-dynamic";

export type CompareProject = { id: string; name: string };

export type CompareTeamMember = {
  id: string;
  provider: string;
  model: string;
  position: number;
};

export type CompareTeam = {
  id: string;
  name: string;
  default_tone: string;
  members: CompareTeamMember[];
};

export type CompareConnection = { provider: string; status: string };

export default async function ComparePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const serviceClient = createServiceClient();

  const [
    { data: projects },
    { data: teams },
    { data: members },
    { data: connections },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("archived", false)
      .order("pinned", { ascending: false })
      .order("name"),
    serviceClient
      .from("ai_teams")
      .select("id, name, default_tone")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    serviceClient
      .from("ai_team_members")
      .select("id, ai_team_id, provider, model, position")
      .order("position", { ascending: true }),
    serviceClient
      .from("api_connections")
      .select("provider, status")
      .eq("user_id", user.id)
      .in("status", ["connected", "untested"]),
  ]);

  const teamRows = (teams ?? []) as {
    id: string;
    name: string;
    default_tone: string;
  }[];
  const memberRows = (members ?? []) as {
    id: string;
    ai_team_id: string;
    provider: string;
    model: string;
    position: number;
  }[];

  const teamsWithMembers: CompareTeam[] = teamRows.map((t) => ({
    id: t.id,
    name: t.name,
    default_tone: t.default_tone,
    members: memberRows
      .filter((m) => m.ai_team_id === t.id)
      .map(({ id, provider, model, position }) => ({
        id,
        provider,
        model,
        position,
      })),
  }));

  const connectionList = (connections ?? []) as CompareConnection[];
  const mergedConnections =
    isGroqBuiltinEnabled() &&
    !connectionList.some((c) => c.provider === "groq")
      ? [...connectionList, { provider: "groq", status: "connected" }]
      : connectionList;

  return (
    <CompareUI
      projects={(projects ?? []) as CompareProject[]}
      teams={teamsWithMembers}
      connections={mergedConnections}
    />
  );
}
