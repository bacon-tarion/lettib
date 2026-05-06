import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getOverviewStats } from "@/lib/admin/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Next's notFound() throws an error whose `digest` starts with "NEXT_NOT_FOUND".
function isNotFoundError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    typeof (e as { digest: unknown }).digest === "string" &&
    (e as { digest: string }).digest.startsWith("NEXT_NOT_FOUND")
  );
}

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    if (isNotFoundError(e)) {
      // Mirror page-level "do not reveal admin exists" behaviour.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }

  const stats = await getOverviewStats();
  return NextResponse.json(stats);
}
