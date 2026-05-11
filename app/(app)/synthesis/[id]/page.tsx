import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getModelDisplayName,
  getProviderLabel,
} from "@/lib/providers/models";
import { cn } from "@/lib/utils";
import { SynthesisActions } from "./synthesis-actions";
import { ConflictResolver } from "@/components/synthesis/conflict-resolver";
import { SynthesisMarkdown } from "@/components/synthesis/synthesis-markdown";
import type { Conflict } from "@/lib/synthesis/lineage";

export const dynamic = "force-dynamic";

const PROVIDER_BG: Record<string, string> = {
  openai: "bg-blue-500",
  anthropic: "bg-amber-500",
  google: "bg-green-500",
  xai: "bg-purple-500",
  groq: "bg-orange-500",
  custom: "bg-gray-500",
};

export default async function SynthesisPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const serviceClient = createServiceClient();

  const { data: synth } = await serviceClient
    .from("syntheses")
    .select(
      "id, user_id, conversation_id, project_id, prompt, content, provider, model, tone, tokens_in, tokens_out, cost_usd, latency_ms, source_response_ids, created_at, score, user_feedback, conflict_resolutions"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!synth || (synth as { user_id: string }).user_id !== user.id) {
    notFound();
  }

  const synthesis = synth as {
    id: string;
    conversation_id: string | null;
    project_id: string | null;
    prompt: string;
    content: string;
    provider: string | null;
    model: string | null;
    tone: string;
    tokens_in: number;
    tokens_out: number;
    cost_usd: number;
    latency_ms: number;
    source_response_ids: string[];
    created_at: string;
    score: number | null;
    user_feedback: string | null;
    conflict_resolutions: (Conflict & { chosen: string | null })[] | null;
  };

  const conflicts = synthesis.conflict_resolutions ?? [];

  let sources: { id: string; provider: string; model: string }[] = [];
  let compareCostUsd = 0;
  if (synthesis.source_response_ids.length > 0) {
    const { data: sourceRows } = await serviceClient
      .from("model_responses")
      .select("id, provider, model, cost_usd")
      .in("id", synthesis.source_response_ids);
    sources = ((sourceRows ?? []) as {
      id: string;
      provider: string;
      model: string;
      cost_usd?: number;
    }[]).map(({ id, provider, model }) => ({ id, provider, model }));
    compareCostUsd = (sourceRows ?? []).reduce(
      (sum, r) => sum + Number((r as { cost_usd?: number }).cost_usd ?? 0),
      0
    );
  } else if (synthesis.conversation_id) {
    const { data: convRows } = await serviceClient
      .from("model_responses")
      .select("id, provider, model, cost_usd")
      .eq("conversation_id", synthesis.conversation_id);
    sources = ((convRows ?? []) as {
      id: string;
      provider: string;
      model: string;
    }[]).map((r) => ({
      id: r.id,
      provider: r.provider,
      model: r.model,
    }));
    compareCostUsd = (convRows ?? []).reduce(
      (sum, r) => sum + Number((r as { cost_usd?: number }).cost_usd ?? 0),
      0
    );
  }

  const synthesisCost = Number(synthesis.cost_usd ?? 0);
  const totalCost = compareCostUsd + synthesisCost;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">LettiB Synthesis</h1>
        <Badge variant="secondary" className="capitalize">
          {synthesis.tone}
        </Badge>
      </div>

      <Card className="bg-muted/40">
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wider">
            Original question
          </p>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{synthesis.prompt}</p>
        </CardContent>
      </Card>

      {sources.length > 0 && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-muted-foreground shrink-0">Models compared:</span>
          {sources.map((s) => (
            <Badge
              key={s.id}
              className={cn(
                "text-xs text-white border-0",
                PROVIDER_BG[s.provider] ?? "bg-gray-500"
              )}
              title={`${getProviderLabel(s.provider)} — ${s.model}`}
            >
              {getModelDisplayName(s.provider, s.model)}
            </Badge>
          ))}
        </div>
      )}

      {conflicts.length > 0 && (
        <ConflictResolver
          synthesisId={synthesis.id}
          initialConflicts={conflicts}
        />
      )}

      <div>
        <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">
          Merged answer
        </p>
        <SynthesisMarkdown content={synthesis.content} />
      </div>

      <Card className="border-dashed bg-muted/20">
        <CardContent className="pt-4 pb-3 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Cost breakdown
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
            <span>
              Compare (models):{" "}
              <strong className="text-foreground">${compareCostUsd.toFixed(5)}</strong>
            </span>
            <span>
              Synthesis ({synthesis.model ?? "—"}):{" "}
              <strong className="text-foreground">${synthesisCost.toFixed(5)}</strong>
            </span>
            <span className="text-muted-foreground">·</span>
            <span>
              Total:{" "}
              <strong className="text-foreground">${totalCost.toFixed(5)}</strong>
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums flex-wrap">
        <span>
          Synthesized with{" "}
          {synthesis.provider
            ? `${getProviderLabel(synthesis.provider)} · ${synthesis.model ?? ""}`
            : "—"}
        </span>
        <span>·</span>
        <span>{synthesis.tokens_in + synthesis.tokens_out} tokens</span>
        <span>·</span>
        <span>{synthesis.latency_ms}ms</span>
      </div>

      <Separator />

      <SynthesisActions
        synthesisId={synthesis.id}
        content={synthesis.content}
        initialScore={synthesis.score}
        initialFeedback={synthesis.user_feedback}
        conversationId={synthesis.conversation_id}
        initialTone={synthesis.tone}
        projectId={synthesis.project_id}
      />
    </div>
  );
}
