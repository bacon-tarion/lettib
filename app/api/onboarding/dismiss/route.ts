import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_dismissed: true })
    .eq("id", user.id);

  if (error) {
    console.error("[onboarding/dismiss] update failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log("[onboarding/dismiss] dismissed for user", user.id);
  return NextResponse.json({ ok: true });
}
