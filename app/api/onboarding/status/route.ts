import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("onboarding_dismissed")
    .eq("id", user.id)
    .maybeSingle();

  const dismissed =
    (profileRow as { onboarding_dismissed?: boolean } | null)
      ?.onboarding_dismissed ?? false;

  let hasApiKey = false;
  let hasRunCompare = false;

  if (!dismissed) {
    const [{ count: apiKeyCount }, { count: compareCount }] = await Promise.all([
      supabase
        .from("api_connections")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("status", ["connected", "untested"]),
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("mode", "compare"),
    ]);
    hasApiKey = (apiKeyCount ?? 0) > 0;
    hasRunCompare = (compareCount ?? 0) > 0;
  }

  return NextResponse.json({ hasApiKey, hasRunCompare, dismissed });
}
