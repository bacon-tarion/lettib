import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { MODELS_CATALOG } from "@/lib/providers";
import { LETTIB_SYNTHESIS_ATTRIBUTION_PROMPT } from "@/lib/prompts/synthesis-attribution";
import { formatCompareResponsesForAttribution } from "@/lib/synthesis/attribution-tags";
import {
  extractConflictsBlock,
  parseLineage,
} from "@/lib/synthesis/lineage";
import { MEMORY_EXTRACTION_PROMPT } from "@/lib/prompts/memory";
import { MEMORY_FIELDS, type MemoryFieldKey } from "@/lib/memory/fields";
import { upsertMemoryFields } from "@/lib/memory/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYNTH_PROVIDER = "anthropic";
const SYNTH_MODEL = "claude-sonnet-4-6";

function calcCost(provider: string, model: string, tin: number, tout: number) {
  const catalog = MODELS_CATALOG as Record<
    string,
    readonly { id: string; cost_in: number; cost_out: number }[]
  >;
  const entry = catalog[provider]?.find((m) => m.id === model);
  if (!entry) return 0;
  return (entry.cost_in * tin) / 1_000_000 + (entry.cost_out * tout) / 1_000_000;
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
    comparison_id,
    conversation_id,
    tone,
    project_id: bodyProjectId,
  } = body as {
    comparison_id?: string;
    conversation_id?: string;
    tone?: string;
    project_id?: string | null;
  };

  const comparisonId = comparison_id ?? conversation_id;
  if (!comparisonId || typeof comparisonId !== "string") {
    return NextResponse.json(
      { error: "comparison_id or conversation_id is required" },
      { status: 400 }
    );
  }

  const serviceClient = createServiceClient();

  const { data: conv } = await serviceClient
    .from("conversations")
    .select("id, user_id, project_id, title")
    .eq("id", comparisonId)
    .single();

  if (!conv || (conv as { user_id: string }).user_id !== user.id) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  let projectId: string | null =
    (conv as { project_id: string | null }).project_id ?? null;
  if (bodyProjectId) {
    const { data: owned } = await serviceClient
      .from("projects")
      .select("id")
      .eq("id", bodyProjectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!owned) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    projectId = bodyProjectId;
  }

  const { data: userMsg } = await serviceClient
    .from("messages")
    .select("content")
    .eq("conversation_id", comparisonId)
    .eq("role", "user")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  const prompt =
    (userMsg as { content: string } | null)?.content ??
    (conv as { title: string }).title ??
    "";

  const { data: responses } = await serviceClient
    .from("model_responses")
    .select("id, provider, model, content, error")
    .eq("conversation_id", comparisonId)
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

  const { data: anthropicConn } = await serviceClient
    .from("api_connections")
    .select("vault_secret_id, custom_base_url")
    .eq("user_id", user.id)
    .eq("provider", "anthropic")
    .in("status", ["connected", "untested"])
    .maybeSingle();

  if (!anthropicConn) {
    return NextResponse.json(
      {
        error:
          "LettiB Synthesis uses Claude Sonnet on your Anthropic account. Connect Anthropic in Settings.",
      },
      { status: 400 }
    );
  }

  const { data: apiKey, error: vaultError } = await serviceClient.rpc(
    "lettib_read_secret",
    {
      p_secret_id: (anthropicConn as { vault_secret_id: string }).vault_secret_id,
    }
  );
  if (vaultError || !apiKey) {
    return NextResponse.json(
      { error: "Could not decrypt Anthropic API key for synthesis" },
      { status: 500 }
    );
  }
  const trimmedKey =
    typeof apiKey === "string" ? apiKey.trim() : String(apiKey).trim();
  if (!trimmedKey) {
    return NextResponse.json(
      { error: "Anthropic API key is empty after decrypt" },
      { status: 500 }
    );
  }

  const modelResponsesBlock = formatCompareResponsesForAttribution(successful);
  const toneUsed = (tone ?? "professional").trim() || "professional";
  const filledPrompt = LETTIB_SYNTHESIS_ATTRIBUTION_PROMPT.replace(
    "{{user_question}}",
    prompt
  )
    .replace("{{tone}}", toneUsed)
    .replace("{{model_responses}}", modelResponsesBlock);

  const synthModel = createAnthropic({ apiKey: trimmedKey })(SYNTH_MODEL);

  try {
    const startedAt = Date.now();
    const result = await generateText({
      model: synthModel,
      messages: [{ role: "user", content: filledPrompt }],
    });

    const tokensIn = result.usage?.promptTokens ?? 0;
    const tokensOut = result.usage?.completionTokens ?? 0;
    const cost = calcCost(SYNTH_PROVIDER, SYNTH_MODEL, tokensIn, tokensOut);
    const latency = Date.now() - startedAt;

    const { conflicts, bodyWithoutBlock } = extractConflictsBlock(result.text);
    const { lineage } = parseLineage(bodyWithoutBlock);

    const id = randomUUID();
    const row = {
      id,
      user_id: user.id,
      comparison_id: comparisonId,
      project_id: projectId,
      prompt,
      content: bodyWithoutBlock,
      tone: toneUsed,
      provider: SYNTH_PROVIDER,
      model: SYNTH_MODEL,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: cost,
      latency_ms: latency,
      source_response_ids: successful.map((r) => r.id),
      lineage_data: lineage,
      conflict_resolutions: conflicts.map((c) => ({ ...c, chosen: null })),
    };

    const { error: ansErr } = await serviceClient
      .from("synthesis_answers")
      .insert(row);
    if (ansErr) {
      console.error("synthesis_answers insert:", ansErr);
      return NextResponse.json(
        {
          error:
            ansErr.message ??
            "Failed to save synthesis (run migration 021_synthesis_answers.sql?)",
        },
        { status: 500 }
      );
    }

    const { error: synthError } = await serviceClient.from("syntheses").insert({
      id,
      user_id: user.id,
      conversation_id: comparisonId,
      project_id: projectId,
      prompt,
      content: bodyWithoutBlock,
      provider: SYNTH_PROVIDER,
      model: SYNTH_MODEL,
      tone: toneUsed,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: cost,
      latency_ms: latency,
      source_response_ids: successful.map((r) => r.id),
      lineage_data: lineage,
      conflict_resolutions: conflicts.map((c) => ({ ...c, chosen: null })),
      mode: "api",
    });

    if (synthError) {
      // Best-effort cleanup of the orphaned synthesis_answers row.
      const { error: cleanupErr } = await serviceClient
        .from("synthesis_answers")
        .delete()
        .eq("id", id);
      if (cleanupErr) {
        console.error(
          "[synthesis] failed to clean up synthesis_answers after error:",
          cleanupErr
        );
      }
      return NextResponse.json(
        { error: synthError.message ?? "Failed to save synthesis" },
        { status: 500 }
      );
    }

    await serviceClient.from("usage_logs").insert({
      user_id: user.id,
      conversation_id: comparisonId,
      action: "synthesis",
      provider: SYNTH_PROVIDER,
      model: SYNTH_MODEL,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: cost,
      latency_ms: latency,
    });

    if (projectId) {
      try {
        const { data: proj } = await serviceClient
          .from("projects")
          .select("memory_enabled")
          .eq("id", projectId)
          .single();

        if ((proj as { memory_enabled: boolean } | null)?.memory_enabled) {
          const { data: existing } = await serviceClient
            .from("project_memory")
            .select("*")
            .eq("project_id", projectId)
            .maybeSingle();

          const current = (existing ?? {}) as Partial<
            Record<MemoryFieldKey, string | null>
          >;

          let extractionPrompt = MEMORY_EXTRACTION_PROMPT;
          for (const f of MEMORY_FIELDS) {
            extractionPrompt = extractionPrompt.replace(
              `{{${f.key}}}`,
              (current[f.key] as string | null) || "(empty)"
            );
          }
          extractionPrompt = extractionPrompt
            .replace("{{question}}", prompt)
            .replace("{{synthesis}}", result.text);

          const extractionResult = await generateText({
            model: synthModel,
            messages: [{ role: "user", content: extractionPrompt }],
          });

          const rawText = extractionResult.text.trim();
          let raw = rawText;
          const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fenceMatch) raw = fenceMatch[1].trim();

          let parsed: Record<string, unknown> = {};
          const tryParse = (s: string) => {
            try {
              const v = JSON.parse(s);
              if (v && typeof v === "object" && !Array.isArray(v)) {
                parsed = v as Record<string, unknown>;
                return true;
              }
            } catch {
              /* fall through */
            }
            return false;
          };
          if (!tryParse(raw)) {
            const first = raw.indexOf("{");
            const last = raw.lastIndexOf("}");
            if (first !== -1 && last > first) {
              tryParse(raw.slice(first, last + 1));
            }
          }

          const updates: Partial<Record<MemoryFieldKey, string>> = {};
          for (const f of MEMORY_FIELDS) {
            const v = parsed[f.key];
            if (typeof v === "string" && v.trim().length > 0) {
              updates[f.key] = v;
            }
          }

          if (Object.keys(updates).length > 0) {
            await upsertMemoryFields({
              userId: user.id,
              projectId,
              updates,
            });
          }

          const extractTokensIn = extractionResult.usage?.promptTokens ?? 0;
          const extractTokensOut = extractionResult.usage?.completionTokens ?? 0;
          await serviceClient.from("usage_logs").insert({
            user_id: user.id,
            conversation_id: comparisonId,
            action: "memory_extraction",
            provider: SYNTH_PROVIDER,
            model: SYNTH_MODEL,
            tokens_in: extractTokensIn,
            tokens_out: extractTokensOut,
            cost_usd: calcCost(
              SYNTH_PROVIDER,
              SYNTH_MODEL,
              extractTokensIn,
              extractTokensOut
            ),
            latency_ms: 0,
          });
        }
      } catch (err) {
        console.error("memory extraction failed:", err);
      }
    }

    return NextResponse.json({
      success: true,
      synthesis_id: id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Synthesis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
