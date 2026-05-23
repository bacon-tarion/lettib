import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listCompareSnapshots } from "@/lib/compare/snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const comparisonId = req.nextUrl.searchParams.get("comparison_id");
  if (!comparisonId) {
    return NextResponse.json(
      { error: "comparison_id is required" },
      { status: 400 }
    );
  }

  const snapshots = await listCompareSnapshots(comparisonId, user.id);
  return NextResponse.json({ snapshots });
}
