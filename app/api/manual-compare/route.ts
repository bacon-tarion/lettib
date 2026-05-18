import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { createGroq } from "@ai-sdk/groq";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { MODELS_CATALOG } from "@/lib/providers/models";
import { SYNTHESIS_PROMPT } from "@/lib/prompts/synthesis";
import {
  extractConflictsBlock,
  parseLineage,
} from "@/lib/synthesis/lineage";
import { logUsageAsync } from "@/lib/usage/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ManualResponseInput {
  source: string;
  customName?: string;
  content: string;
}

/** Map paste "Source" labels to API providers (only these may be used for synthesis). */
const SOURCE_TO_API_PROVIDER: Record<
  string,
  "openai" | "anthropic" | "google" | "xai" | "groq" | undefined
> = {
  ChatGPT: "openai",
  Claude: "anthropic",
  Gemini: "google",
  Grok: "xai",
  Groq: "groq",
  Perplexity: undefined,
  Custom: undefined,
};

const SOURCE_TO_SLUG: Record<string, string> = {
  ChatGPT: "gpt",
  Claude: "claude",
  Gemini: "gemini",
  Grok: "grok",
  Groq: "groq",
  Perplexity: "perplexity",
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "source";
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

function defaultModelForProvider(provider: string): string {
  const catalog = MODELS_CATALOG as Record<string, readonly { id: string }[]>;
  const first = catalog[provider]?.[0];
  if (!first) throw new Error(`No catalog model for provider: ${provider}`);
  return first.id;
}

type ConnRow = {
  provider: string;
  vault_secret_id: string;
  custom_base_url: string | null;
  custom_model_name: string | null;
};

/** Unique API providers implied by the user's source labels, in first-appearance order. */
function preferredApiProvidersFromResponses(
  responses: ManualResponseInput[]
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of responses) {
    const p = SOURCE_TO_API_PROVIDER[r.source];
    if (!p) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

async function buildModelInstance(
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
      throw new Error(`Unsupported synthesis provider: ${provider}`);
  }
}

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

  const { data: connections } = await serviceClient
    .from("api_connections")
    .select("provider, vault_secret_id, custom_base_url, custom_model_name")
    .eq("user_id", user.id)
    .in("status", ["connected", "untested"]);

  const connByProvider = new Map<string, ConnRow>();
  for (const c of (connections ?? []) as ConnRow[]) {
    connByProvider.set(c.provider, c);
  }

  const preferred = preferredApiProvidersFromResponses(responses);
  if (preferred.length === 0) {
    return NextResponse.json(
      {
        error:
          "Label at least one pasted response as ChatGPT, Claude, Gemini, Grok, or Groq so we can use your matching API connection for synthesis (Custom / Perplexity alone cannot pick a provider).",
      },
      { status: 400 }
    );
  }

  let synthProvider: string | null = null;
  let synthConn: ConnRow | null = null;
  for (const p of preferred) {
    const row = connByProvider.get(p);
    if (row) {
      synthProvider = p;
      synthConn = row;
      break;
    }
  }

  if (!synthProvider || !synthConn) {
    const need = preferred
      .map((p) =>
        p === "openai"
          ? "OpenAI (ChatGPT)"
          : p === "anthropic"
            ? "Anthropic (Claude)"
            : p === "google"
              ? "Google (Gemini)"
              : p === "xai"
                ? "xAI (Grok)"
                : p === "groq"
                  ? "Groq"
                  : p
      )
      .join(", ");
    return NextResponse.json(
      {
        error: `No connected API key for your labeled sources. Connect one of: ${need} in Settings, then try again.`,
      },
      { status: 400 }
    );
  }

  const synthModel =
    synthProvider === "custom"
      ? synthConn.custom_model_name || "custom"
      : defaultModelForProvider(synthProvider);

  const { data: vaultKey, error: vaultError } = await serviceClient.rpc(
    "lettib_read_secret",
    { p_secret_id: synthConn.vault_secret_id }
  );
  if (vaultError || !vaultKey) {
    return NextResponse.json(
      { error: "Could not read API key for synthesis. Re-save your connection in Settings." },
      { status: 500 }
    );
  }
  const apiKey =
    typeof vaultKey === "string" ? vaultKey.trim() : String(vaultKey).trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Stored API key is empty. Update your connection in Settings." },
      { status: 500 }
    );
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
    const model = await buildModelInstance(
      synthProvider,
      synthModel,
      apiKey,
      synthConn.custom_base_url
    );

    const result = await generateText({
      model,
      messages: [{ role: "user", content: filledPrompt }],
    });

    const tokensIn = result.usage?.promptTokens ?? 0;
    const tokensOut = result.usage?.completionTokens ?? 0;
    const cost = calcCost(synthProvider, synthModel, tokensIn, tokensOut);
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
        provider: synthProvider,
        model: synthModel,
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

    logUsageAsync(serviceClient, {
      userId: user.id,
      conversationId: null,
      action: "synthesis_manual",
      provider: synthProvider,
      model: synthModel,
      tokensIn,
      tokensOut,
      costUsd: cost,
      latencyMs: latency,
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
