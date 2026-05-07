import { listTeams, generateStarterTeams } from "./actions";
import { listApiKeys } from "@/app/(app)/settings/actions";
import { TeamsGrid } from "@/components/teams/teams-grid";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const [connections] = await Promise.all([listApiKeys()]);

  const connectedCount = connections.filter(
    (c) => c.status === "connected" || c.status === "untested"
  ).length;

  let teams = await listTeams();

  // Auto-generate starter teams when user has 2+ providers and no teams yet
  if (teams.length === 0 && connectedCount >= 2) {
    await generateStarterTeams();
    teams = await listTeams();
  }

  return <TeamsGrid initialTeams={teams} connectedProviders={connections} />;
}
