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
import { ShareDialog } from "@/components/synthesis/share-dialog";

export const dynamic = "force-dynamic";

const PROVIDER_BG: Record<string, string> = {
  openai: "bg-blue-500",
  anthropic: "bg-amber-500",
  google: "bg-green-500",
  xai: "bg-purple-500",
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
      "id, user_id, conversation_id, project_id, prompt, content, provider, model, tone, tokens_in, tokens_out, cost_usd, latency_ms, source_response_ids, created_at, is_public, share_token, score, user_feedback"
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
    is_public: boolean;
    share_token: string | null;
    score: number | null;
    user_feedback: string | null;
  };

  // Load the source model_responses to render the "models used" pills
  let sources: { id: string; provider: string; model: string }[] = [];
  if (synthesis.source_response_ids.length > 0) {
    const { data: sourceRows } = await serviceClient
      .from("model_responses")
      .select("id, provider, model")
      .in("id", synthesis.source_response_ids);
    sources = (sourceRows ?? []) as {
      id: string;
      provider: string;
      model: string;
    }[];
  }

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
            Original Question
          </p>
          <p className="text-sm whitespace-pre-wrap">{synthesis.prompt}</p>
        </CardContent>
      </Card>

      {sources.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground self-center">
            Models used:
          </span>
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

      <div className="prose prose-sm max-w-none dark:prose-invert">
        <p className="text-base leading-relaxed whitespace-pre-wrap">
          {synthesis.content}
        </p>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
        <span>
          Synthesized by{" "}
          {synthesis.provider
            ? `${getProviderLabel(synthesis.provider)} ${synthesis.model ?? ""}`
            : "—"}
        </span>
        <span>·</span>
        <span>{synthesis.tokens_in + synthesis.tokens_out} tokens</span>
        <span>·</span>
        <span>${synthesis.cost_usd.toFixed(5)}</span>
        <span>·</span>
        <span>{synthesis.latency_ms}ms</span>
      </div>

      <Separator />

      <SynthesisActions
        synthesisId={synthesis.id}
        content={synthesis.content}
        initialScore={synthesis.score}
        initialFeedback={synthesis.user_feedback}
        shareSlot={
          <ShareDialog
            synthesisId={synthesis.id}
            initialIsPublic={synthesis.is_public}
            initialShareToken={synthesis.share_token}
          />
        }
      />
    </div>
  );
}
