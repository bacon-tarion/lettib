import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { MODELS_CATALOG } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MessageInput = { role: "user" | "assistant" | "system"; content: string };

type SaveBody = {
  conversation_id?: string | null;
  project_id?: string | null;
  messages?: unknown;
  provider?: unknown;
  model?: unknown;
  tokens_in?: unknown;
  tokens_out?: unknown;
  latency_ms?: unknown;
};

function isValidMessages(v: unknown): v is MessageInput[] {
  if (!Array.isArray(v)) return false;
  return v.every(
    (m) =>
      m &&
      typeof m === "object" &&
      typeof (m as { role?: unknown }).role === "string" &&
      ["user", "assistant", "system"].includes((m as { role: string }).role) &&
      typeof (m as { content?: unknown }).content === "string"
  );
}

function asInt(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function catalogHas(provider: string, model: string): boolean {
  const catalog = MODELS_CATALOG as Record<string, readonly { id: string }[]>;
  return !!catalog[provider]?.some((m) => m.id === model);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const provider =
    typeof body.provider === "string" ? body.provider.toLowerCase() : "";
  const model = typeof body.model === "string" ? body.model : "";
  const messages = body.messages;
  const conversationIdInput =
    typeof body.conversation_id === "string" && body.conversation_id.length > 0
      ? body.conversation_id
      : null;
  const projectIdInput =
    typeof body.project_id === "string" && body.project_id.length > 0
      ? body.project_id
      : null;

  if (!isValidMessages(messages) || !provider || !model) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }
  // Allow `custom` provider to skip catalog membership (user-defined models).
  if (provider !== "custom" && !catalogHas(provider, model)) {
    return NextResponse.json(
      { error: "Unknown provider/model" },
      { status: 400 }
    );
  }

  // Trust *_in/_out/latency only enough not to crash. Negative or non-finite
  // values fall back to 0 — we don't accept unbounded user-supplied costs.
  const tokensIn = asInt(body.tokens_in);
  const tokensOut = asInt(body.tokens_out);
  const latencyMs = asInt(body.latency_ms);

  const serviceClient = createServiceClient();
  let convId = conversationIdInput;

  if (convId) {
    // Verify ownership of the destination conversation.
    const { data: existing } = await serviceClient
      .from("conversations")
      .select("id, user_id, deleted_at")
      .eq("id", convId)
      .maybeSingle();
    const row = existing as
      | { id: string; user_id: string; deleted_at: string | null }
      | null;
    if (!row || row.user_id !== user.id || row.deleted_at) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }
  } else {
    let resolvedProjectId: string | null = null;
    if (projectIdInput) {
      // Verify the user owns the destination project before parking the chat there.
      const { data: ownedProject } = await serviceClient
        .from("projects")
        .select("id")
        .eq("id", projectIdInput)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!ownedProject) {
        return NextResponse.json(
          { error: "Project not found or not owned by user" },
          { status: 403 }
        );
      }
      resolvedProjectId = (ownedProject as { id: string }).id;
    }

    if (!resolvedProjectId) {
      const { data: inbox } = await serviceClient
        .from("projects")
        .select("id")
        .eq("user_id", user.id)
        .eq("name", "Inbox")
        .limit(1)
        .maybeSingle();
      resolvedProjectId = (inbox as { id: string } | null)?.id ?? null;
    }

    const userMsg = messages.find((m) => m.role === "user");
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

  const messagesToInsert = messages.map((m) => ({
    conversation_id: convId,
    role: m.role,
    content: m.content,
    provider: m.role === "assistant" ? provider : null,
    model: m.role === "assistant" ? model : null,
    tokens_in: m.role === "assistant" ? tokensIn : null,
    tokens_out: m.role === "assistant" ? tokensOut : null,
  }));

  const { error: insertError } = await serviceClient
    .from("messages")
    .insert(messagesToInsert);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const catalog = MODELS_CATALOG as Record<
    string,
    readonly { id: string; cost_in: number; cost_out: number }[]
  >;
  const modelEntry = catalog[provider]?.find((m) => m.id === model);
  const costUsd = modelEntry
    ? (modelEntry.cost_in * tokensIn) / 1_000_000 +
      (modelEntry.cost_out * tokensOut) / 1_000_000
    : 0;

  await serviceClient.from("usage_logs").insert({
    user_id: user.id,
    conversation_id: convId,
    action: "chat",
    provider,
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: costUsd,
    latency_ms: latencyMs,
  });

  return NextResponse.json({ success: true, conversation_id: convId });
}
