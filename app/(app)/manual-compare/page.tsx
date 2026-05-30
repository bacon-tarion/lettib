import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ManualCompareUI } from "@/components/manual-compare/manual-compare-ui";

export const dynamic = "force-dynamic";

export default async function ManualComparePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const serviceClient = createServiceClient();
  const { data: connections } = await serviceClient
    .from("api_connections")
    .select("id")
    .eq("user_id", user.id)
    .in("status", ["connected", "untested"])
    .limit(1);

  const hasConnectedApiKey = (connections?.length ?? 0) > 0;

  return <ManualCompareUI hasConnectedApiKey={hasConnectedApiKey} />;
}
