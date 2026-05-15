import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireOwner(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const sc = createServiceClient();
  const { data: conv } = await sc
    .from("conversations")
    .select(
      "id, user_id, project_id, title, mode, provider, model, created_at, updated_at, deleted_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (!conv || (conv as { user_id: string }).user_id !== user.id) {
    return {
      error: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }
  return { user, sc, conv: conv as ConversationRow };
}

type ConversationRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  mode: "chat" | "compare";
  provider: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await requireOwner(params.id);
  if ("error" in result) return result.error;
  const { sc, conv } = result;

  if (conv.deleted_at) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ data: messages }, { data: modelResponses }] = await Promise.all([
    sc
      .from("messages")
      .select(
        "id, role, content, provider, model, tokens_in, tokens_out, created_at"
      )
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true }),
    conv.mode === "compare"
      ? sc
          .from("model_responses")
          .select(
            "id, provider, model, content, tokens_in, tokens_out, cost_usd, latency_ms, error, score_accuracy, score_clarity, score_creativity, score_usefulness, score_risk, position, round_index, round_kind, created_at"
          )
          .eq("conversation_id", conv.id)
          .order("position", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  return NextResponse.json({
    conversation: conv,
    messages: messages ?? [],
    model_responses: modelResponses ?? [],
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await requireOwner(params.id);
  if ("error" in result) return result.error;
  const { user, sc, conv } = result;

  if (conv.deleted_at) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const updates: { project_id?: string | null; title?: string } = {};

  if ("project_id" in body) {
    const newProjectId = body.project_id as string | null;
    if (newProjectId) {
      // Verify the user owns the destination project
      const { data: project } = await sc
        .from("projects")
        .select("id")
        .eq("id", newProjectId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!project) {
        return NextResponse.json(
          { error: "Project not found or not owned by user" },
          { status: 403 }
        );
      }
      updates.project_id = newProjectId;
    } else {
      updates.project_id = null;
    }
  }

  if ("title" in body && typeof body.title === "string") {
    const trimmed = body.title.trim().slice(0, 200);
    if (trimmed.length === 0) {
      return NextResponse.json(
        { error: "Title cannot be empty" },
        { status: 400 }
      );
    }
    updates.title = trimmed;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const { error } = await sc
    .from("conversations")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", conv.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await requireOwner(params.id);
  if ("error" in result) return result.error;
  const { sc, conv } = result;

  if (conv.deleted_at) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await sc
    .from("conversations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", conv.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
