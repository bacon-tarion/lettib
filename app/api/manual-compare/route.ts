import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { MODELS_CATALOG } from "@/lib/providers/models";
import { SYNTHESIS_PROMPT } from "@/lib/prompts/synthesis";
import { LETTIB_SYNTHESIS_CLEAN_PROMPT } from "@/lib/prompts/synthesis-clean";
import {
  extractConflictsBlock,
  parseLineage,
} from "@/lib/synthesis/lineage";
import { resolveSynthesisProvider } from "@/lib/synthesis/resolve-provider";
import { logUsageAsync } from "@/lib/usage/log";
import { processUploadedFile } from "@/lib/files/extract-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANUAL_COMPARE_BYOK_REQUIRED =
  "Manual Compare requires at least one connected API key. Add a key in Settings → API Keys to use this feature.";

interface ManualResponseInput {
  source: string;
  customName?: string;
  content: string;
}

interface ImageContextInput {
  name: string;
  imageBase64: string;
}

const SOURCE_TO_SLUG: Record<string, string> = {
  ChatGPT: "gpt",
  Claude: "claude",
  Gemini: "gemini",
  Grok: "grok",
  Groq: "groq",
  Perplexity: "perplexity",
  File: "file",
  Image: "image",
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

  const contentType = req.headers.get("content-type") ?? "";
  let prompt = "";
  let tone = "professional";
  let projectId: string | null = null;
  let responses: ManualResponseInput[] = [];
  let imageContexts: ImageContextInput[] = [];

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    prompt = (form.get("prompt") as string)?.trim() ?? "";
    tone = ((form.get("tone") as string)?.trim() || "professional");
    const pid = form.get("project_id");
    projectId = typeof pid === "string" && pid.length > 0 ? pid : null;

    const responsesRaw = form.get("responses");
    if (typeof responsesRaw === "string") {
      try {
        responses = JSON.parse(responsesRaw) as ManualResponseInput[];
      } catch (err) {
        console.error("[manual-compare] invalid responses JSON:", err);
        return NextResponse.json({ error: "Invalid responses payload" }, { status: 400 });
      }
    }

    const fileEntries = form.getAll("files");
    for (const entry of fileEntries) {
      if (!(entry instanceof File) || entry.size === 0) continue;
      try {
        const processed = await processUploadedFile(entry);
        if (processed.imageBase64) {
          imageContexts.push({
            name: processed.name,
            imageBase64: processed.imageBase64,
          });
          responses.push({
            source: "Image",
            customName: processed.name,
            content: `[Image attached: ${processed.name}]`,
          });
        } else if (processed.text) {
          responses.push({
            source: "File",
            customName: processed.name,
            content: processed.text,
          });
        }
      } catch (err) {
        console.error("[manual-compare] file processing failed:", err);
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "File processing failed" },
          { status: 400 }
        );
      }
    }
  } else {
    const body = (await req.json().catch(() => ({}))) as {
      prompt?: string;
      responses?: ManualResponseInput[];
      tone?: string;
      project_id?: string | null;
      images?: ImageContextInput[];
    };

    prompt = (body.prompt ?? "").trim();
    tone = (body.tone ?? "professional").trim() || "professional";
    projectId = body.project_id ?? null;
    responses = body.responses ?? [];
    imageContexts = body.images ?? [];
  }

  const filledResponses = responses.filter(
    (r) => r && typeof r.content === "string" && r.content.trim().length > 0
  );

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }
  if (filledResponses.length < 2) {
    return NextResponse.json(
      { error: "At least 2 non-empty responses are required" },
      { status: 400 }
    );
  }
  if (filledResponses.length > 8) {
    return NextResponse.json(
      { error: "Maximum 8 responses allowed (including uploaded files)" },
      { status: 400 }
    );
  }

  const serviceClient = createServiceClient();

  const { data: connections } = await serviceClient
    .from("api_connections")
    .select("id")
    .eq("user_id", user.id)
    .in("status", ["connected", "untested"])
    .limit(1);

  if (!connections || connections.length === 0) {
    return NextResponse.json({ error: MANUAL_COMPARE_BYOK_REQUIRED }, { status: 403 });
  }

  if (projectId) {
    const { data: proj } = await serviceClient
      .from("projects")
      .select("id, user_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!proj || (proj as { user_id: string }).user_id !== user.id) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  let projectContext = "(no project context)";
  if (projectId) {
    const { data: project } = await serviceClient
      .from("projects")
      .select("name, description, custom_instructions")
      .eq("id", projectId)
      .maybeSingle();
    if (project) {
      const p = project as {
        name: string;
        description: string | null;
        custom_instructions: string | null;
      };
      const parts = [p.name, p.description, p.custom_instructions].filter(Boolean);
      projectContext = parts.join(" — ");
    }
  }

  const slugs = buildSlugs(filledResponses);
  const sourceSlugList = filledResponses
    .map((r, i) => `- ${slugs[i]}  (pasted from ${displayName(r)})`)
    .join("\n");
  const formattedResponses = filledResponses
    .map(
      (r, i) =>
        `### Response ${i + 1} — slug: ${slugs[i]} (${displayName(r)})\n${r.content.trim()}`
    )
    .join("\n\n");

  let imageBlock = "";
  if (imageContexts.length > 0) {
    imageBlock =
      "\n\nAttached images for visual context:\n" +
      imageContexts.map((img) => `- ${img.name}`).join("\n");
  }

  const filledPrompt =
    SYNTHESIS_PROMPT.replace("{{question}}", prompt)
      .replace("{{project_context}}", projectContext)
      .replace("{{tone}}", tone)
      .replace("{{source_slugs}}", sourceSlugList)
      .replace("{{responses}}", formattedResponses) + imageBlock;

  try {
    let synthProvider: string;
    let synthModelId: string;
    let synthModel: Awaited<
      ReturnType<typeof resolveSynthesisProvider>
    >["model"];

    try {
      const resolved = await resolveSynthesisProvider(
        serviceClient,
        user.id,
        "manual",
        { requireByok: true }
      );
      synthProvider = resolved.provider;
      synthModelId = resolved.modelId;
      synthModel = resolved.model;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : MANUAL_COMPARE_BYOK_REQUIRED;
      return NextResponse.json({ error: message }, { status: 403 });
    }

    const startedAt = Date.now();

    type ContentPart =
      | { type: "text"; text: string }
      | { type: "image"; image: string };

    const contentParts: ContentPart[] = [{ type: "text", text: filledPrompt }];
    for (const img of imageContexts) {
      contentParts.push({ type: "image", image: img.imageBase64 });
    }

    const result = await generateText({
      model: synthModel,
      messages: [{ role: "user", content: contentParts }],
    });

    const tokensIn = result.usage?.promptTokens ?? 0;
    const tokensOut = result.usage?.completionTokens ?? 0;
    const cost = calcCost(synthProvider, synthModelId, tokensIn, tokensOut);
    const latency = Date.now() - startedAt;

    const { conflicts, bodyWithoutBlock } = extractConflictsBlock(result.text);
    const { lineage } = parseLineage(bodyWithoutBlock);

    let cleanContent: string | null = null;
    let cleanTokensIn = 0;
    let cleanTokensOut = 0;
    let cleanCost = 0;
    let cleanLatency = 0;
    try {
      const cleanPrompt = LETTIB_SYNTHESIS_CLEAN_PROMPT.replace(
        "{{user_question}}",
        prompt
      )
        .replace("{{tone}}", tone)
        .replace("{{detailed_synthesis}}", bodyWithoutBlock);

      const cleanStartedAt = Date.now();
      const cleanResult = await generateText({
        model: synthModel,
        messages: [{ role: "user", content: cleanPrompt }],
      });
      cleanLatency = Date.now() - cleanStartedAt;
      cleanTokensIn = cleanResult.usage?.promptTokens ?? 0;
      cleanTokensOut = cleanResult.usage?.completionTokens ?? 0;
      cleanCost = calcCost(
        synthProvider,
        synthModelId,
        cleanTokensIn,
        cleanTokensOut
      );
      cleanContent = cleanResult.text.trim();
    } catch (cleanErr) {
      console.error(
        "[manual-compare] clean pass failed (Detailed still saved):",
        cleanErr
      );
    }

    const { data: synthRow, error: synthError } = await serviceClient
      .from("syntheses")
      .insert({
        user_id: user.id,
        conversation_id: null,
        project_id: projectId,
        prompt,
        content: bodyWithoutBlock,
        detailed_content: bodyWithoutBlock,
        clean_content: cleanContent,
        provider: synthProvider,
        model: synthModelId,
        tone,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: cost,
        latency_ms: latency,
        clean_provider: cleanContent ? synthProvider : null,
        clean_model: cleanContent ? synthModelId : null,
        clean_tokens_in: cleanTokensIn,
        clean_tokens_out: cleanTokensOut,
        clean_cost_usd: cleanCost,
        clean_latency_ms: cleanLatency,
        source_response_ids: [],
        lineage_data: lineage,
        conflict_resolutions: conflicts.map((c) => ({ ...c, chosen: null })),
        mode: "manual",
      })
      .select("id")
      .single();

    if (synthError || !synthRow) {
      console.error("[manual-compare] save synthesis failed:", synthError);
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
      model: synthModelId,
      tokensIn,
      tokensOut,
      costUsd: cost,
      latencyMs: latency,
    });

    if (cleanContent) {
      logUsageAsync(serviceClient, {
        userId: user.id,
        conversationId: null,
        action: "synthesis_clean",
        provider: synthProvider,
        model: synthModelId,
        tokensIn: cleanTokensIn,
        tokensOut: cleanTokensOut,
        costUsd: cleanCost,
        latencyMs: cleanLatency,
      });
    }

    return NextResponse.json({
      success: true,
      synthesis_id: (synthRow as { id: string }).id,
    });
  } catch (err) {
    console.error("[manual-compare] synthesis failed:", err);
    const message = err instanceof Error ? err.message : "Synthesis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
