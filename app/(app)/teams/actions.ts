"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { MODELS_CATALOG, DEFAULT_TEAM_MODELS } from "@/lib/providers/models";

// ─── Types ───────────────────────────────────────────────────────────────────

export type TeamMember = {
  id: string;
  ai_team_id: string;
  provider: string;
  model: string;
  position: number;
};

export type Team = {
  id: string;
  name: string;
  default_tone: string;
  primary_provider: string;
  primary_model: string;
  members: TeamMember[];
  created_at: string;
};

type TeamInput = {
  name: string;
  default_tone: string;
  members: Array<{ provider: string; model: string; position: number }>;
  primary_provider: string;
  primary_model: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

function getProviderForModelId(modelId: string): string | undefined {
  const catalog = MODELS_CATALOG as Record<
    string,
    readonly { id: string; name: string; context: number; cost_in: number; cost_out: number }[]
  >;
  for (const [provider, models] of Object.entries(catalog)) {
    if (models.some((m) => m.id === modelId)) return provider;
  }
  return undefined;
}

// ─── Server Actions ───────────────────────────────────────────────────────────

export async function createTeam(
  input: TeamInput
): Promise<{ success: boolean; team_id?: string; error?: string }> {
  const user = await requireUser();

  if (!input.name?.trim()) return { success: false, error: "Team name is required." };
  if (input.name.trim().length > 50)
    return { success: false, error: "Team name must be 50 characters or fewer." };
  if (!input.members || input.members.length < 2)
    return { success: false, error: "A team needs at least 2 models." };

  const serviceClient = createServiceClient();

  const { data: connections } = await serviceClient
    .from("api_connections")
    .select("provider, status")
    .eq("user_id", user.id);

  const connectedProviders = new Set<string>(["custom"]);
  for (const c of connections ?? []) {
    if (c.status === "connected" || c.status === "untested") {
      connectedProviders.add(c.provider as string);
    }
  }
  for (const member of input.members) {
    if (!connectedProviders.has(member.provider)) {
      return {
        success: false,
        error: `You haven't connected ${member.provider}. Add an API key in Settings first.`,
      };
    }
  }

  const { data: team, error: teamError } = await serviceClient
    .from("ai_teams")
    .insert({
      user_id: user.id,
      name: input.name.trim(),
      default_tone: input.default_tone || "professional",
      primary_provider: input.primary_provider,
      primary_model: input.primary_model,
    })
    .select("id")
    .single();

  if (teamError || !team) {
    return { success: false, error: teamError?.message ?? "Failed to create team." };
  }

  const membersToInsert = input.members.map((m, i) => ({
    ai_team_id: team.id,
    provider: m.provider,
    model: m.model,
    position: m.position ?? i,
  }));

  const { error: membersError } = await serviceClient
    .from("ai_team_members")
    .insert(membersToInsert);

  if (membersError) {
    await serviceClient.from("ai_teams").delete().eq("id", team.id);
    return { success: false, error: membersError.message };
  }

  revalidatePath("/teams");
  return { success: true, team_id: team.id };
}

export async function updateTeam(
  teamId: string,
  input: TeamInput
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();
  const serviceClient = createServiceClient();

  const { data: existing } = await serviceClient
    .from("ai_teams")
    .select("id, user_id")
    .eq("id", teamId)
    .single();

  if (!existing) return { success: false, error: "Team not found." };
  if ((existing.user_id as string) !== user.id) return { success: false, error: "Unauthorized." };

  if (!input.name?.trim()) return { success: false, error: "Team name is required." };
  if (input.name.trim().length > 50)
    return { success: false, error: "Team name must be 50 characters or fewer." };
  if (!input.members || input.members.length < 2)
    return { success: false, error: "A team needs at least 2 models." };

  const { data: connsForMembers } = await serviceClient
    .from("api_connections")
    .select("provider, status")
    .eq("user_id", user.id);
  const connectedProviders = new Set<string>(["custom"]);
  for (const c of connsForMembers ?? []) {
    if (c.status === "connected" || c.status === "untested") {
      connectedProviders.add(c.provider as string);
    }
  }
  for (const member of input.members) {
    if (!connectedProviders.has(member.provider)) {
      return {
        success: false,
        error: `You haven't connected ${member.provider}. Add an API key in Settings first.`,
      };
    }
  }

  const { error: updateError } = await serviceClient
    .from("ai_teams")
    .update({
      name: input.name.trim(),
      default_tone: input.default_tone || "professional",
      primary_provider: input.primary_provider,
      primary_model: input.primary_model,
    })
    .eq("id", teamId);

  if (updateError) return { success: false, error: updateError.message };

  await serviceClient.from("ai_team_members").delete().eq("ai_team_id", teamId);

  const membersToInsert = input.members.map((m, i) => ({
    ai_team_id: teamId,
    provider: m.provider,
    model: m.model,
    position: m.position ?? i,
  }));

  const { error: membersError } = await serviceClient
    .from("ai_team_members")
    .insert(membersToInsert);

  if (membersError) return { success: false, error: membersError.message };

  revalidatePath("/teams");
  return { success: true };
}

export async function deleteTeam(
  teamId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();
  const serviceClient = createServiceClient();

  const { data: existing } = await serviceClient
    .from("ai_teams")
    .select("id, user_id")
    .eq("id", teamId)
    .single();

  if (!existing) return { success: false, error: "Team not found." };
  if ((existing.user_id as string) !== user.id) return { success: false, error: "Unauthorized." };

  const { error } = await serviceClient
    .from("ai_teams")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", teamId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/teams");
  return { success: true };
}

export async function listTeams(): Promise<Team[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const serviceClient = createServiceClient();

    const { data: teams, error } = await serviceClient
      .from("ai_teams")
      .select("id, name, default_tone, primary_provider, primary_model, created_at")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error || !teams) return [];

    const teamIds = (teams as { id: string }[]).map((t) => t.id);
    if (teamIds.length === 0) return [];

    const { data: members } = await serviceClient
      .from("ai_team_members")
      .select("id, ai_team_id, provider, model, position")
      .in("ai_team_id", teamIds)
      .order("position", { ascending: true });

    return (teams as { id: string; name: string; default_tone: string; primary_provider: string; primary_model: string; created_at: string }[]).map((team) => ({
      ...team,
      members: ((members ?? []) as TeamMember[]).filter((m) => m.ai_team_id === team.id),
    }));
  } catch {
    return [];
  }
}

export async function generateStarterTeams(): Promise<{
  success?: boolean;
  created?: number;
  error?: string;
}> {
  const user = await requireUser();
  const serviceClient = createServiceClient();

  const { data: connections } = await serviceClient
    .from("api_connections")
    .select("provider, status")
    .eq("user_id", user.id);

  const connectedProviders = new Set<string>(
    ((connections ?? []) as { provider: string; status: string }[])
      .filter((c) => c.status === "connected" || c.status === "untested")
      .map((c) => c.provider)
  );
  if (connectedProviders.size < 2) {
    return { error: "Connect at least 2 providers first" };
  }

  const { data: existingTeams } = await serviceClient
    .from("ai_teams")
    .select("id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .limit(1);

  if (existingTeams && existingTeams.length > 0) {
    return { error: "Already has teams" };
  }

  const starterDefs = [
    { name: "Research Team",   tone: "academic",      models: DEFAULT_TEAM_MODELS.research   as readonly string[] },
    { name: "Coding Team",     tone: "technical",     models: DEFAULT_TEAM_MODELS.coding     as readonly string[] },
    { name: "Brainstorm Team", tone: "friendly",      models: DEFAULT_TEAM_MODELS.brainstorm as readonly string[] },
  ];

  let created = 0;

  for (const def of starterDefs) {
    const eligibleModels = def.models.filter((modelId) => {
      const provider = getProviderForModelId(modelId);
      return provider !== undefined && connectedProviders.has(provider);
    });

    if (eligibleModels.length < 2) continue;

    const firstModelId = eligibleModels[0];
    const firstProvider = getProviderForModelId(firstModelId)!;

    const { data: team, error: teamError } = await serviceClient
      .from("ai_teams")
      .insert({
        user_id: user.id,
        name: def.name,
        default_tone: def.tone,
        primary_provider: firstProvider,
        primary_model: firstModelId,
      })
      .select("id")
      .single();

    if (teamError || !team) continue;

    const members = eligibleModels.map((modelId, i) => ({
      ai_team_id: (team as { id: string }).id,
      provider: getProviderForModelId(modelId)!,
      model: modelId,
      position: i,
    }));

    await serviceClient.from("ai_team_members").insert(members);
    created++;
  }

  revalidatePath("/teams");
  return { success: true, created };
}
