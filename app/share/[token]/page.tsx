import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getModelDisplayName,
  getProviderLabel,
} from "@/lib/providers/models";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import { SynthesisMarkdown } from "@/components/synthesis/synthesis-markdown";

export const dynamic = "force-dynamic";

const PROVIDER_BG: Record<string, string> = {
  openai: "bg-blue-500",
  anthropic: "bg-amber-500",
  google: "bg-green-500",
  xai: "bg-purple-500",
  custom: "bg-gray-500",
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v
  );
}

export async function generateMetadata() {
  return {
    title: "Shared LettiB Synthesis",
    description: "A multi-AI synthesized answer shared via LettiB.",
    robots: { index: false, follow: false },
    openGraph: {
      title: "Shared LettiB Synthesis",
      description: "A multi-AI synthesized answer shared via LettiB.",
    },
  };
}

export default async function PublicSharePage({
  params,
}: {
  params: { token: string };
}) {
  if (!isUuid(params.token)) notFound();

  const service = createServiceClient();
  const { data: synth } = await service
    .from("syntheses")
    .select(
      "id, prompt, content, provider, model, tone, source_response_ids, created_at, is_public"
    )
    .eq("share_token", params.token)
    .eq("is_public", true)
    .maybeSingle();

  if (!synth) notFound();

  const synthesis = synth as {
    id: string;
    prompt: string;
    content: string;
    provider: string | null;
    model: string | null;
    tone: string;
    source_response_ids: string[];
    created_at: string;
  };

  let sources: { id: string; provider: string; model: string }[] = [];
  if (synthesis.source_response_ids.length > 0) {
    const { data: sourceRows } = await service
      .from("model_responses")
      .select("id, provider, model")
      .in("id", synthesis.source_response_ids);
    sources = (sourceRows ?? []) as {
      id: string;
      provider: string;
      model: string;
    }[];
  }

  const created = new Date(synthesis.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <Sparkles className="h-4 w-4" />
            LettiB
          </Link>
          <Button asChild size="sm">
            <Link href="/signup">Try LettiB</Link>
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]">
              Shared synthesis
            </Badge>
            <Badge variant="secondary" className="capitalize">
              {synthesis.tone}
            </Badge>
            <span className="text-xs text-muted-foreground ml-auto">
              {created}
            </span>
          </div>
          <h1 className="text-2xl font-bold">LettiB Synthesis</h1>
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

        <SynthesisMarkdown content={synthesis.content} />

        {synthesis.provider && (
          <div className="text-xs text-muted-foreground">
            Synthesized by {getProviderLabel(synthesis.provider)}{" "}
            {synthesis.model ?? ""}
          </div>
        )}

        <Separator />

        <Card className="bg-muted/30 border-dashed">
          <CardContent className="pt-6 pb-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" /> Run prompts across multiple AIs
              </p>
              <p className="text-xs text-muted-foreground">
                Compare GPT-4, Claude, Gemini and Grok side-by-side, then
                synthesize one merged answer.
              </p>
            </div>
            <Button asChild>
              <Link href="/signup">Try LettiB free</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
