import { listTeams, generateStarterTeams } from "./actions";
import { listApiKeys } from "@/app/(app)/settings/actions";
import { isGroqBuiltinEnabled } from "@/lib/builtin-providers";
import { TeamsGrid } from "@/components/teams/teams-grid";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const [connections] = await Promise.all([listApiKeys()]);

  const vaultConnectedCount = connections.filter(
    (c) => c.status === "connected" || c.status === "untested"
  ).length;
  const effectiveProviderCount =
    vaultConnectedCount + (isGroqBuiltinEnabled() ? 1 : 0);

  let teams = await listTeams();

  // Auto-generate starter teams when user has 2+ providers and no teams yet
  if (teams.length === 0 && effectiveProviderCount >= 2) {
    await generateStarterTeams();
    teams = await listTeams();
  }

  return (
    <TeamsGrid
      initialTeams={teams}
      connectedProviders={connections}
      builtinGroqAvailable={isGroqBuiltinEnabled()}
    />
  );
}
