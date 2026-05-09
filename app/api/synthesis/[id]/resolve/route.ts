import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createGroq } from "@ai-sdk/groq";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { MODELS_CATALOG, getServerApiKey } from "@/lib/providers";
import {
  providerToSlug,
  extractConflictsBlock,
  parseLineage,
  type Conflict,
} from "@/lib/synthesis/lineage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ResolutionInput {
  id: string;
  chosen: string | null;
}

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
    case "groq":
      return createGroq({ apiKey })(model);
    case "custom":
      if (!baseUrl) throw new Error("baseUrl required for custom provider");
      return createOpenAI({ apiKey, baseURL: baseUrl })(model);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * PATCH /api/synthesis/[id]/resolve
 * Body: { resolutions: [{ id, chosen }] }
 * Saves the user's chosen positions onto the synthesis row.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    resolutions?: ResolutionInput[];
  };
  const incoming = Array.isArray(body.resolutions) ? body.resolutions : [];

  const sb = createServiceClient();
  const { data: synth } = await sb
    .from("syntheses")
    .select("user_id, conflict_resolutions")
    .eq("id", params.id)
    .single();

  if (!synth || (synth as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = ((synth as { conflict_resolutions: Conflict[] | null })
    .conflict_resolutions ?? []) as (Conflict & { chosen: string | null })[];

  const merged = existing.map((c) => {
    const update = incoming.find((r) => r.id === c.id);
    return update ? { ...c, chosen: update.chosen } : c;
  });

  const { error } = await sb
    .from("syntheses")
    .update({ conflict_resolutions: merged })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, conflict_resolutions: merged });
}

/**
 * POST /api/synthesis/[id]/resolve
 * Re-runs the synthesis using the user's chosen positions as authoritative.
 * Replaces the synthesis content + lineage + (cleared) conflicts in place.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createServiceClient();
  const { data: synth } = await sb
    .from("syntheses")
    .select(
      "id, user_id, conversation_id, prompt, provider, model, tone, conflict_resolutions, source_response_ids"
    )
    .eq("id", params.id)
    .single();

  if (!synth || (synth as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const s = synth as {
    id: string;
    user_id: string;
    conversation_id: string;
    prompt: string;
    provider: string;
    model: string;
    tone: string;
    conflict_resolutions: (Conflict & { chosen: string | null })[];
    source_response_ids: string[];
  };

  const resolved = (s.conflict_resolutions ?? []).filter((c) => c.chosen);
  if (resolved.length === 0) {
    return NextResponse.json(
      { error: "No conflict resolutions to apply" },
      { status: 400 }
    );
  }

  // Reload the source responses
  const { data: rows } = await sb
    .from("model_responses")
    .select("id, provider, model, content, error")
    .in("id", s.source_response_ids);

  const successful = ((rows ?? []) as {
    id: string;
    provider: string;
    model: string;
    content: string;
    error: string | null;
  }[]).filter((r) => !r.error && r.content?.trim());

  // Resolve API key (paid → fallback to free env key for groq/google)
  let apiKey: string | null = null;
  let baseUrl: string | null = null;
  const { data: conn } = await sb
    .from("api_connections")
    .select("vault_secret_id, custom_base_url")
    .eq("user_id", user.id)
    .eq("provider", s.provider)
    .in("status", ["connected", "untested"])
    .maybeSingle();
  if (conn) {
    const c = conn as {
      vault_secret_id: string;
      custom_base_url: string | null;
    };
    baseUrl = c.custom_base_url;
    const { data: secret } = await sb.rpc("lettib_read_secret", {
      p_secret_id: c.vault_secret_id,
    });
    if (typeof secret === "string") apiKey = secret;
  }
  if (!apiKey) apiKey = getServerApiKey(s.provider);
  if (!apiKey) {
    return NextResponse.json(
      { error: `No API key available for ${s.provider}` },
      { status: 400 }
    );
  }

  const sourceSlugList = successful
    .map((r) => `- ${providerToSlug(r.provider)}  (${r.provider} / ${r.model})`)
    .join("\n");

  const formattedResponses = successful
    .map(
      (r, i) =>
        `### Response ${i + 1} — slug: ${providerToSlug(r.provider)}\n${r.content}`
    )
    .join("\n\n");

  const resolutionDirective = resolved
    .map(
      (c) =>
        `• On "${c.topic}": treat ${c.chosen}'s position as authoritative — "${
          c.positions.find((p) => p.model === c.chosen)?.claim ?? ""
        }". Do NOT re-litigate this disagreement.`
    )
    .join("\n");

  const guided = `You previously produced a synthesis that surfaced disagreements between sources. The user has now resolved those disagreements as follows:

${resolutionDirective}

Re-synthesize the original question below using the same SOURCES, but defer to the user's chosen positions for the listed conflicts. You may still note OTHER disagreements that were not on the resolution list. Use the same OUTPUT FORMAT (conflicts block + tagged sentences).

User question: ${s.prompt}
Tone: ${s.tone}

SOURCES (use these slugs exactly when tagging):
${sourceSlugList}

Model responses:
${formattedResponses}`;

  try {
    const startedAt = Date.now();
    const m = await buildModel(s.provider, s.model, apiKey, baseUrl);
    const result = await generateText({
      model: m,
      messages: [{ role: "user", content: guided }],
    });
    const latency = Date.now() - startedAt;
    const tokensIn = result.usage?.promptTokens ?? 0;
    const tokensOut = result.usage?.completionTokens ?? 0;
    const cost = calcCost(s.provider, s.model, tokensIn, tokensOut);

    const { conflicts: newConflicts, bodyWithoutBlock } = extractConflictsBlock(
      result.text
    );
    const { lineage } = parseLineage(bodyWithoutBlock);

    // Preserve previously-resolved conflicts (they are now baked in); only
    // store newly-detected ones unresolved.
    const resolvedIds = new Set(resolved.map((c) => c.id));
    const remainingConflicts = newConflicts
      .filter((c) => !resolvedIds.has(c.id))
      .map((c) => ({ ...c, chosen: null }));

    const { error } = await sb
      .from("syntheses")
      .update({
        content: bodyWithoutBlock,
        lineage_data: lineage,
        conflict_resolutions: remainingConflicts,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: cost,
        latency_ms: latency,
      })
      .eq("id", s.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await sb.from("usage_logs").insert({
      user_id: user.id,
      conversation_id: s.conversation_id,
      action: "synthesis_resolve",
      provider: s.provider,
      model: s.model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: cost,
      latency_ms: latency,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Resolve failed" },
      { status: 500 }
    );
  }
}
