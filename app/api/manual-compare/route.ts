import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getServerApiKey } from "@/lib/providers";
import {
  SYNTHESIS_PROMPT,
} from "@/lib/prompts/synthesis";
import {
  extractConflictsBlock,
  parseLineage,
} from "@/lib/synthesis/lineage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manual Compare synthesis uses built-in Groq (GROQ_API_KEY) so users need no keys.
const SYNTH_PROVIDER = "groq";
const SYNTH_MODEL = "llama-3.3-70b-versatile";

interface ManualResponseInput {
  source: string;
  customName?: string;
  content: string;
}

const SOURCE_TO_SLUG: Record<string, string> = {
  ChatGPT: "gpt",
  Claude: "claude",
  Gemini: "gemini",
  Grok: "grok",
  Perplexity: "perplexity",
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "source";
}

/**
 * Build unique slugs for the pasted responses. Custom sources use a slugified
 * version of their name; standard sources map to canonical slugs. Duplicates
 * (e.g. two ChatGPT pastes) get -1/-2 suffixes so lineage tags can target a
 * specific paste.
 */
function buildSlugs(items: ManualResponseInput[]): string[] {
  const bases = items.map((it) =>
    it.source === "Custom"
      ? slugify(it.customName || "custom")
      : SOURCE_TO_SLUG[it.source] ?? slugify(it.source)
  );
  const counts: Record<string, number> = {};
  for (const b of bases) counts[b] = (counts[b] ?? 0) + 1;
  const seen: Record<string, number> = {};
  return bases.map((b) => {
    if ((counts[b] ?? 0) <= 1) return b;
    seen[b] = (seen[b] ?? 0) + 1;
    return `${b}-${seen[b]}`;
  });
}

function displayName(it: ManualResponseInput): string {
  return it.source === "Custom" ? (it.customName || "Custom") : it.source;
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

  const apiKey = getServerApiKey("groq");
  if (!apiKey?.trim()) {
    return NextResponse.json(
      { error: "Manual Compare is not configured (GROQ_API_KEY missing)." },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    prompt?: string;
    responses?: ManualResponseInput[];
    tone?: string;
    project_id?: string | null;
  };

  const prompt = (body.prompt ?? "").trim();
  const tone = (body.tone ?? "professional").trim() || "professional";
  const projectId = body.project_id ?? null;
  const responses = (body.responses ?? []).filter(
    (r) => r && typeof r.content === "string" && r.content.trim().length > 0
  );

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }
  if (responses.length < 2) {
    return NextResponse.json(
      { error: "At least 2 non-empty responses are required" },
      { status: 400 }
    );
  }
  if (responses.length > 6) {
    return NextResponse.json(
      { error: "Maximum 6 responses allowed" },
      { status: 400 }
    );
  }

  const serviceClient = createServiceClient();

  // If a project_id is supplied, verify ownership before linking
  if (projectId) {
    const { data: proj } = await serviceClient
      .from("projects")
      .select("id, user_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!proj || (proj as { user_id: string }).user_id !== user.id) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }
  }

  // Optional project context for the prompt
  let projectContext = "(no project context)";
  if (projectId) {
    const { data: project } = await serviceClient
      .from("projects")
      .select("name, description")
      .eq("id", projectId)
      .maybeSingle();
    if (project) {
      projectContext = [
        (project as { name: string }).name,
        (project as { description: string | null }).description,
      ]
        .filter(Boolean)
        .join(" — ");
    }
  }

  const slugs = buildSlugs(responses);
  const sourceSlugList = responses
    .map((r, i) => `- ${slugs[i]}  (pasted from ${displayName(r)})`)
    .join("\n");
  const formattedResponses = responses
    .map(
      (r, i) =>
        `### Response ${i + 1} — slug: ${slugs[i]} (${displayName(r)})\n${r.content.trim()}`
    )
    .join("\n\n");

  const filledPrompt = SYNTHESIS_PROMPT.replace("{{question}}", prompt)
    .replace("{{project_context}}", projectContext)
    .replace("{{tone}}", tone)
    .replace("{{source_slugs}}", sourceSlugList)
    .replace("{{responses}}", formattedResponses);

  try {
    const startedAt = Date.now();
    const model = createGroq({ apiKey })(SYNTH_MODEL);

    const result = await generateText({
      model,
      messages: [{ role: "user", content: filledPrompt }],
    });

    const tokensIn = result.usage?.promptTokens ?? 0;
    const tokensOut = result.usage?.completionTokens ?? 0;
    const cost = 0;
    const latency = Date.now() - startedAt;

    const { conflicts, bodyWithoutBlock } = extractConflictsBlock(result.text);
    const { lineage } = parseLineage(bodyWithoutBlock);

    const { data: synthRow, error: synthError } = await serviceClient
      .from("syntheses")
      .insert({
        user_id: user.id,
        conversation_id: null,
        project_id: projectId,
        prompt,
        content: bodyWithoutBlock,
        provider: SYNTH_PROVIDER,
        model: SYNTH_MODEL,
        tone,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: cost,
        latency_ms: latency,
        source_response_ids: [],
        lineage_data: lineage,
        conflict_resolutions: conflicts.map((c) => ({ ...c, chosen: null })),
        mode: "manual",
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
      conversation_id: null,
      action: "synthesis_manual",
      provider: SYNTH_PROVIDER,
      model: SYNTH_MODEL,
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
