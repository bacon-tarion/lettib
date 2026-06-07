import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchOnboardingStatus } from "@/lib/onboarding/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_CACHE_HEADERS }
    );
  }

  const status = await fetchOnboardingStatus(supabase, user.id);

  return NextResponse.json(status, { headers: NO_CACHE_HEADERS });
}
