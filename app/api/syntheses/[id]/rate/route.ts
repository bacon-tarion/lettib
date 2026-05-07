import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FEEDBACK_LEN = 5000;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { rating?: unknown; feedback?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ratingNum = Number(body.rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return NextResponse.json(
      { error: "rating must be an integer 1-5" },
      { status: 400 }
    );
  }

  let feedback: string | null = null;
  if (body.feedback != null) {
    if (typeof body.feedback !== "string") {
      return NextResponse.json(
        { error: "feedback must be a string" },
        { status: 400 }
      );
    }
    const trimmed = body.feedback.trim();
    if (trimmed.length > MAX_FEEDBACK_LEN) {
      return NextResponse.json(
        { error: `feedback must be ${MAX_FEEDBACK_LEN} characters or fewer` },
        { status: 400 }
      );
    }
    feedback = trimmed.length > 0 ? trimmed : null;
  }

  const service = createServiceClient();

  // Verify ownership before mutating.
  const { data: existing } = await service
    .from("syntheses")
    .select("id, user_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!existing || (existing as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await service
    .from("syntheses")
    .update({ score: ratingNum, user_feedback: feedback })
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, score: ratingNum, feedback });
}
