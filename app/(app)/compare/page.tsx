import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isGroqBuiltinEnabled } from "@/lib/builtin-providers";
import { listTeams } from "@/app/(app)/teams/actions";
import { CompareUI } from "@/components/compare/compare-ui";

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
  const mergedConnections =
    isGroqBuiltinEnabled() &&
    !connectionList.some((c) => c.provider === "groq")
      ? [
          ...connectionList,
          {
            provider: "groq",
            status: "connected",
            custom_base_url: null,
            custom_model_name: null,
          },
        ]
      : connectionList;

  return (
    <CompareUI
      projects={(projects ?? []) as CompareProject[]}
      connections={mergedConnections}
      teams={teams}
    />
  );
}
