import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { calcCompareModelCost } from "@/lib/compare/cost";
import { logUsageAsync } from "@/lib/usage/log";
import { saveCompareSnapshot } from "@/lib/compare/snapshots";
import { triggerMemoryExtractionAsync } from "@/lib/memory/extract-async";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResponsePayload = {
  key: string;
  provider: string;
  model: string;
  content: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  error?: string | null;
  position?: number;
};

function finalizeCompareRound(opts: {
  userId: string;
  conversationId: string;
  projectId: string | null;
  prompt: string;
  responses: ResponsePayload[];
  roundNumber?: number;
}) {
  if (typeof opts.roundNumber === "number") {
    void saveCompareSnapshot({
      userId: opts.userId,
      comparisonId: opts.conversationId,
      roundNumber: opts.roundNumber,
      snapshotData: {
        prompt: opts.prompt,
        responses: opts.responses,
        saved_at: new Date().toISOString(),
      },
    });
  }

  if (opts.projectId) {
    const content = [
      `Prompt: ${opts.prompt}`,
      ...opts.responses.map(
        (r) => `${r.provider}/${r.model}: ${r.content?.slice(0, 2000) ?? ""}`
      ),
    ].join("\n\n");
    triggerMemoryExtractionAsync({
      userId: opts.userId,
      projectId: opts.projectId,
      conversationId: opts.conversationId,
      content,
    });
  }
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

  const body = await req.json();
  const {
    prompt,
    project_id,
    responses,
    conversation_id: existingConversationId,
    round_number: roundNumber,
  } = body as {
    prompt: string;
    project_id?: string | null;
    responses: ResponsePayload[];
    conversation_id?: string | null;
    round_number?: number;
  };

  if (!prompt || !Array.isArray(responses) || responses.length === 0) {
    return NextResponse.json(
      { error: "prompt and responses are required" },
      { status: 400 }
    );
  }

  const serviceClient = createServiceClient();

  if (existingConversationId) {
    const { data: conv, error: convErr } = await serviceClient
      .from("conversations")
      .select("id, user_id, mode, project_id")
      .eq("id", existingConversationId)
      .single();

    if (convErr || !conv || (conv as { user_id: string }).user_id !== user.id) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }
    if ((conv as { mode: string }).mode !== "compare") {
      return NextResponse.json(
        { error: "Not a compare conversation" },
        { status: 400 }
      );
    }

    const { data: existingRows, error: rowsErr } = await serviceClient
      .from("model_responses")
      .select("id, position")
      .eq("conversation_id", existingConversationId)
      .order("position", { ascending: true });

    if (rowsErr || !existingRows?.length) {
      return NextResponse.json(
        { error: "No model responses found for this conversation" },
        { status: 400 }
      );
    }

    const rows = existingRows as { id: string; position: number }[];
    const responseIds: { key: string; id: string }[] = [];
    for (const resp of responses) {
      const pos =
        typeof resp.position === "number"
          ? resp.position
          : parseInt(resp.key.split("::").pop() ?? "-1", 10);
      const row = rows.find((r) => r.position === pos);
      if (row) responseIds.push({ key: resp.key, id: row.id });
    }

    finalizeCompareRound({
      userId: user.id,
      conversationId: existingConversationId,
      projectId:
        project_id ??
        (conv as { project_id: string | null }).project_id ??
        null,
      prompt,
      responses,
      roundNumber,
    });

    return NextResponse.json({
      success: true,
      conversation_id: existingConversationId,
      response_ids: responseIds,
    });
  }

  let resolvedProjectId: string | null = null;
  if (project_id) {
    const { data: ownedProject } = await serviceClient
      .from("projects")
      .select("id")
      .eq("id", project_id)
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

  const title = prompt.trim().slice(0, 60);

  const { data: conv, error: convError } = await serviceClient
    .from("conversations")
    .insert({
      user_id: user.id,
      project_id: resolvedProjectId,
      title,
      mode: "compare",
      compare_key_mode: "byok",
      provider: responses[0]!.provider,
      model: responses[0]!.model,
    })
    .select("id")
    .single();

  if (convError || !conv) {
    return NextResponse.json(
      { error: convError?.message ?? "Failed to create conversation" },
      { status: 500 }
    );
  }
  const conversationId = (conv as { id: string }).id;

  const { error: msgError } = await serviceClient.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: prompt,
  });
  if (msgError) {
    return NextResponse.json(
      { error: `Failed to save prompt: ${msgError.message}` },
      { status: 500 }
    );
  }

  const responseRows = responses.map((r, i) => ({
    conversation_id: conversationId,
    provider: r.provider,
    model: r.model,
    content: r.content || "",
    tokens_in: r.tokens_in || 0,
    tokens_out: r.tokens_out || 0,
    cost_usd: calcCompareModelCost(
      r.provider,
      r.model,
      r.tokens_in || 0,
      r.tokens_out || 0
    ),
    latency_ms: r.latency_ms || 0,
    error: r.error ?? null,
    position: typeof r.position === "number" ? r.position : i,
    round_index: 0,
    round_kind: "main" as const,
  }));

  const { data: insertedResponses, error: insertError } = await serviceClient
    .from("model_responses")
    .insert(responseRows)
    .select("id, provider, model, position");

  if (insertError || !insertedResponses) {
    return NextResponse.json(
      {
        error: `Failed to save model responses: ${insertError?.message ?? "unknown"}`,
      },
      { status: 500 }
    );
  }

  for (const r of responses) {
    if (r.error) continue;
    logUsageAsync(serviceClient, {
      userId: user.id,
      conversationId,
      action: "compare",
      provider: r.provider,
      model: r.model,
      tokensIn: r.tokens_in || 0,
      tokensOut: r.tokens_out || 0,
      costUsd: calcCompareModelCost(
        r.provider,
        r.model,
        r.tokens_in || 0,
        r.tokens_out || 0
      ),
      latencyMs: r.latency_ms || 0,
    });
  }

  const responseIds: { key: string; id: string }[] = [];
  const insertedByPosition = new Map<number, string>();
  for (const row of insertedResponses as { id: string; position: number }[]) {
    insertedByPosition.set(row.position, row.id);
  }
  for (let i = 0; i < responses.length; i++) {
    const resp = responses[i]!;
    const pos =
      typeof resp.position === "number"
        ? resp.position
        : parseInt(resp.key.split("::").pop() ?? String(i), 10);
    const id = insertedByPosition.get(pos);
    if (id) responseIds.push({ key: resp.key, id });
  }

  finalizeCompareRound({
    userId: user.id,
    conversationId,
    projectId: resolvedProjectId,
    prompt,
    responses,
    roundNumber: roundNumber ?? 0,
  });

  return NextResponse.json({
    success: true,
    conversation_id: conversationId,
    response_ids: responseIds,
  });
}
