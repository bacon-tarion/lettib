import { listTeams, generateStarterTeams } from "./actions";
import { listApiKeys } from "@/app/(app)/settings/actions";
import type { ApiConnection } from "@/app/(app)/settings/actions";
import { TeamsGrid } from "@/components/teams/teams-grid";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const [rawConnections] = await Promise.all([listApiKeys()]);
  const activeConnections = rawConnections.filter(
    (c) => c.status === "connected" || c.status === "untested"
  );
  const connections = activeConnections as ApiConnection[];
  const effectiveProviderCount = connections.length;

  let teams = await listTeams();

  // Auto-generate starter teams when user has 2+ providers and no teams yet
  if (teams.length === 0 && effectiveProviderCount >= 2) {
    await generateStarterTeams();
    teams = await listTeams();
  }

  return (
    <TeamsGrid initialTeams={teams} connectedProviders={connections} />
  );
}
