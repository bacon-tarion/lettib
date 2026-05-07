import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ThumbsDown, ThumbsUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getModelDisplayName,
  getProviderLabel,
} from "@/lib/providers/models";
import { SynthesesSearch } from "@/components/syntheses/syntheses-search";

export const dynamic = "force-dynamic";

interface SynthesisRow {
  id: string;
  prompt: string;
  content: string;
  provider: string | null;
  model: string | null;
  tone: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  source_response_ids: string[];
  score: number | null;
  created_at: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function ProjectSynthesesPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { q?: string };
}) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const service = createServiceClient();

  const { data: project } = await service
    .from("projects")
    .select("id, user_id, name")
    .eq("id", params.id)
    .maybeSingle();

  if (!project || (project as { user_id: string }).user_id !== user.id) {
    notFound();
  }
  const proj = project as { id: string; name: string };

  const { data } = await service
    .from("syntheses")
    .select(
      "id, prompt, content, provider, model, tone, tokens_in, tokens_out, cost_usd, source_response_ids, score, created_at"
    )
    .eq("user_id", user.id)
    .eq("project_id", params.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const all = (data ?? []) as SynthesisRow[];
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const filtered = q
    ? all.filter(
        (s) =>
          s.prompt.toLowerCase().includes(q) ||
          s.content.toLowerCase().includes(q)
      )
    : all;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-2">
        <Link
          href={`/projects/${params.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to {proj.name}
        </Link>
        <h1 className="text-2xl font-bold">Syntheses</h1>
        <p className="text-muted-foreground text-sm">
          {all.length.toLocaleString()} total
        </p>
      </div>

      <SynthesesSearch initialQuery={q} />

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-8 pb-8 text-center text-sm text-muted-foreground">
            {q
              ? "No syntheses match your search."
              : "No syntheses yet. Run a Compare to generate one."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((s) => (
            <Link key={s.id} href={`/synthesis/${s.id}`} className="block">
              <Card className="hover:shadow-sm transition-shadow h-full">
                <CardContent className="pt-4 pb-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug line-clamp-2">
                      {s.prompt}
                    </p>
                    {s.score != null && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 gap-1 text-[11px]"
                      >
                        {s.score >= 4 ? (
                          <ThumbsUp className="h-3 w-3" />
                        ) : s.score <= 2 ? (
                          <ThumbsDown className="h-3 w-3" />
                        ) : null}
                        {s.score}/5
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {s.content}
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {s.tone}
                    </Badge>
                    {s.provider && s.model && (
                      <Badge variant="secondary" className="text-[10px]">
                        {getModelDisplayName(s.provider, s.model)}
                      </Badge>
                    )}
                    {s.source_response_ids.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {s.source_response_ids.length} sources
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums pt-1 border-t">
                    <span>{fmtDate(s.created_at)}</span>
                    <span>${s.cost_usd.toFixed(4)}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Reference to silence unused-import warnings in some setups */}
      <span className="hidden">{getProviderLabel("openai")}</span>
    </div>
  );
}
