import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { MODELS_CATALOG } from "@/lib/providers";
import { SYNTHESIS_PROMPT } from "@/lib/prompts/synthesis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function calcCost(provider: string, model: string, tin: number, tout: number) {
  const catalog = MODELS_CATALOG as Record<
    string,
    readonly { id: string; cost_in: number; cost_out: number }[]
  >;
  const entry = catalog[provider]?.find((m) => m.id === model);
  if (!entry) return 0;
  return (entry.cost_in * tin) / 1_000_000 + (entry.cost_out * tout) / 1_000_000;
}

async function buildModel(
  provider: string,
  model: string,
  apiKey: string,
  baseUrl?: string | null
) {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(model);
    case "xai":
      return createXai({ apiKey })(model);
    case "custom":
      if (!baseUrl) throw new Error("baseUrl required for custom provider");
      return createOpenAI({ apiKey, baseURL: baseUrl })(model);
    default:
      throw new Error(`Unknown provider: ${provider}`);
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
  const { conversation_id, tone } = body as {
    conversation_id: string;
    tone?: string;
  };

  if (!conversation_id) {
    return NextResponse.json(
      { error: "conversation_id is required" },
      { status: 400 }
    );
  }

  const serviceClient = createServiceClient();

  // Verify conversation ownership and load metadata
  const { data: conv } = await serviceClient
    .from("conversations")
    .select("id, user_id, project_id, title")
    .eq("id", conversation_id)
    .single();

  if (!conv || (conv as { user_id: string }).user_id !== user.id) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  // Load the user prompt (first user message)
  const { data: userMsg } = await serviceClient
    .from("messages")
    .select("content")
    .eq("conversation_id", conversation_id)
    .eq("role", "user")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  const prompt =
    (userMsg as { content: string } | null)?.content ??
    (conv as { title: string }).title ??
    "";

  // Load successful model responses
  const { data: responses } = await serviceClient
    .from("model_responses")
    .select("id, provider, model, content, error")
    .eq("conversation_id", conversation_id)
    .order("position", { ascending: true });

  const successful = ((responses ?? []) as {
    id: string;
    provider: string;
    model: string;
    content: string;
    error: string | null;
  }[]).filter((r) => !r.error && r.content?.trim());

  if (successful.length < 2) {
    return NextResponse.json(
      { error: "Need at least 2 successful responses to synthesize" },
      { status: 400 }
    );
  }

  // Use the first response's provider+model as the synthesizer
  const synth = successful[0];

  const { data: scorerConn } = await serviceClient
    .from("api_connections")
    .select("vault_secret_id, custom_base_url")
    .eq("user_id", user.id)
    .eq("provider", synth.provider)
    .in("status", ["connected", "untested"])
    .single();

  if (!scorerConn) {
    return NextResponse.json(
      { error: `Provider ${synth.provider} is no longer connected` },
      { status: 400 }
    );
  }

  const { data: apiKey } = await serviceClient.rpc("lettib_read_secret", {
    p_secret_id: (scorerConn as { vault_secret_id: string }).vault_secret_id,
  });
  if (!apiKey) {
    return NextResponse.json(
      { error: "Could not decrypt API key for synthesis" },
      { status: 500 }
    );
  }

  // Pull project context if memory enabled
  let projectContext = "(no project context)";
  const projectId = (conv as { project_id: string | null }).project_id;
  if (projectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("name, description")
      .eq("id", projectId)
      .single();
    if (project) {
      projectContext = [
        (project as { name: string }).name,
        (project as { description: string | null }).description,
      ]
        .filter(Boolean)
        .join(" — ");
    }
  }

  const formattedResponses = successful
    .map(
      (r, i) =>
        `### Response ${i + 1} — ${r.provider} / ${r.model}\n${r.content}`
    )
    .join("\n\n");

  const filledPrompt = SYNTHESIS_PROMPT.replace("{{question}}", prompt)
    .replace("{{project_context}}", projectContext)
    .replace("{{tone}}", tone || "professional")
    .replace("{{responses}}", formattedResponses);

  try {
    const startedAt = Date.now();
    const synthModel = await buildModel(
      synth.provider,
      synth.model,
      apiKey as string,
      (scorerConn as { custom_base_url: string | null }).custom_base_url
    );

    const result = await generateText({
      model: synthModel,
      messages: [{ role: "user", content: filledPrompt }],
    });

    const tokensIn = result.usage?.promptTokens ?? 0;
    const tokensOut = result.usage?.completionTokens ?? 0;
    const cost = calcCost(synth.provider, synth.model, tokensIn, tokensOut);
    const latency = Date.now() - startedAt;

    const { data: synthRow, error: synthError } = await serviceClient
      .from("syntheses")
      .insert({
        user_id: user.id,
        conversation_id,
        project_id: projectId,
        prompt,
        content: result.text,
        provider: synth.provider,
        model: synth.model,
        tone: tone || "professional",
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: cost,
        latency_ms: latency,
        source_response_ids: successful.map((r) => r.id),
      })
      .select("id")
      .single();

    if (synthError || !synthRow) {
      return NextResponse.json(
        { error: synthError?.message ?? "Failed to save synthesis" },
        { status: 500 }
      );
    }

    await serviceClient.from("usage_logs").insert({
      user_id: user.id,
      conversation_id,
      action: "synthesis",
      provider: synth.provider,
      model: synth.model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: cost,
      latency_ms: latency,
    });

    return NextResponse.json({
      success: true,
      synthesis_id: (synthRow as { id: string }).id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Synthesis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
