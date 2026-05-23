import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { groupResults, normaliseRow } from "@/lib/search/types";

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

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length === 0) {
    return NextResponse.json(groupResults("", []));
  }
  if (q.length > 200) {
    return NextResponse.json(
      { error: "Query too long (max 200 chars)" },
      { status: 400 }
    );
  }

  // Call the RPC under the user's auth context — RLS / row scoping inside the
  // function definition handles "users only see their own content".
  const { data, error } = await supabase.rpc("search_user_content", {
    search_query: q,
  });

  if (error) {
    console.error("[search] search_user_content failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = Array.isArray(data)
    ? (data
        .map(normaliseRow)
        .filter((r): r is NonNullable<typeof r> => r !== null) ?? [])
    : [];

  return NextResponse.json(groupResults(q, rows));
}
