import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: existing, error: lookupErr } = await service
    .from("syntheses")
    .select("id, user_id, share_token, is_public")
    .eq("id", params.id)
    .maybeSingle();

  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }
  if (!existing || (existing as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const row = existing as {
    id: string;
    share_token: string | null;
    is_public: boolean;
  };

  // Reuse an existing token if present; only mint a new one when absent.
  const token = row.share_token ?? crypto.randomUUID();

  const { error: updErr } = await service
    .from("syntheses")
    .update({ share_token: token, is_public: true })
    .eq("id", params.id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const origin = req.nextUrl.origin;
  return NextResponse.json({
    success: true,
    is_public: true,
    share_token: token,
    share_url: `${origin}/share/${token}`,
  });
}
