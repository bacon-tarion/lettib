import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireAdmin();
  const body = (await req.json().catch(() => ({}))) as { resolved?: boolean };
  const resolved = body.resolved !== false;

  const sb = createServiceClient();
  const { error } = await sb
    .from("feedback")
    .update({
      resolved,
      resolved_at: resolved ? new Date().toISOString() : null,
    })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
