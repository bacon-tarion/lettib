import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { listTeams } from "@/app/(app)/teams/actions";
import { CompareUI } from "@/components/compare/compare-ui";
import { getUserSubscription, maxCompareModelsForUser } from "@/lib/subscription/tier";

export const dynamic = "force-dynamic";

export type CompareProject = { id: string; name: string };

export type CompareConnection = {
  provider: string;
  status: string;
  custom_base_url: string | null;
  custom_model_name: string | null;
};

export default async function ComparePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const serviceClient = createServiceClient();

  const [{ data: projects }, { data: connections }, teams] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("archived", false)
      .order("pinned", { ascending: false })
      .order("name"),
    serviceClient
      .from("api_connections")
      .select("provider, status, custom_base_url, custom_model_name")
      .eq("user_id", user.id)
      .in("status", ["connected", "untested"]),
    listTeams(),
  ]);

  const connectionList = (connections ?? []) as CompareConnection[];
  const { tier } = await getUserSubscription(user.id);
  const maxCompareModels = maxCompareModelsForUser(tier);

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl p-8 text-sm text-muted-foreground">
          Loading compare…
        </div>
      }
    >
      <CompareUI
        projects={(projects ?? []) as CompareProject[]}
        connections={connectionList}
        teams={teams}
        maxCompareModels={maxCompareModels}
        subscriptionTier={tier}
      />
    </Suspense>
  );
}
