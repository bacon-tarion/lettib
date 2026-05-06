import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { MODELS_CATALOG } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    conversation_id,
    project_id,
    messages,
    provider,
    model,
    tokens_in = 0,
    tokens_out = 0,
    latency_ms = 0,
  } = body;

  if (!messages || !provider || !model) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const serviceClient = createServiceClient();
  let convId: string = conversation_id;

  if (!convId) {
    let resolvedProjectId = project_id || null;

    if (!resolvedProjectId) {
      const { data: inbox } = await serviceClient
        .from("projects")
        .select("id")
        .eq("user_id", user.id)
        .eq("name", "Inbox")
        .limit(1)
        .maybeSingle();
      resolvedProjectId = inbox?.id ?? null;
    }

    const userMsg = (messages as { role: string; content: string }[]).find(
      (m) => m.role === "user"
    );
    const title = userMsg?.content?.slice(0, 60) || "New Chat";

    const { data: conv, error: convError } = await serviceClient
      .from("conversations")
      .insert({
        user_id: user.id,
        project_id: resolvedProjectId,
        title,
        provider,
        model,
      })
      .select("id")
      .single();

    if (convError || !conv) {
      return NextResponse.json(
        { error: convError?.message ?? "Failed to create conversation" },
        { status: 500 }
      );
    }

    convId = (conv as { id: string }).id;
  }

  const messagesToInsert = (
    messages as { role: string; content: string }[]
  ).map((m) => ({
    conversation_id: convId,
    role: m.role,
    content: m.content,
    provider: m.role === "assistant" ? provider : null,
    model: m.role === "assistant" ? model : null,
    tokens_in: m.role === "assistant" ? tokens_in : null,
    tokens_out: m.role === "assistant" ? tokens_out : null,
  }));

  await serviceClient.from("messages").insert(messagesToInsert);

  const catalog = MODELS_CATALOG as Record<
    string,
    readonly { id: string; cost_in: number; cost_out: number }[]
  >;
  const modelEntry = catalog[provider]?.find((m) => m.id === model);
  const costUsd = modelEntry
    ? (modelEntry.cost_in * tokens_in) / 1_000_000 +
      (modelEntry.cost_out * tokens_out) / 1_000_000
    : 0;

  await serviceClient.from("usage_logs").insert({
    user_id: user.id,
    conversation_id: convId,
    action: "chat",
    provider,
    model,
    tokens_in,
    tokens_out,
    cost_usd: costUsd,
    latency_ms,
  });

  return NextResponse.json({ success: true, conversation_id: convId });
}
