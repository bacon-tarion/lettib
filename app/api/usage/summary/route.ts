import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserUsageSummary } from "@/lib/usage/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await getUserUsageSummary();
  return NextResponse.json(summary);
}
