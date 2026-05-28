import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SynthesesSearch } from "@/components/syntheses/syntheses-search";
import {
  SynthesesListGrid,
  type SynthesisListRow,
} from "@/components/syntheses/syntheses-list-grid";

export const dynamic = "force-dynamic";

export default async function GlobalSynthesesPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await sb
    .from("syntheses")
    .select(
      "id, prompt, content, provider, model, tone, tokens_in, tokens_out, cost_usd, source_response_ids, score, created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const all = (data ?? []) as SynthesisListRow[];
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
          href="/compare"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Compare
        </Link>
        <h1 className="text-2xl font-bold">Synthesis history</h1>
        <p className="text-muted-foreground text-sm">
          {all.length.toLocaleString()} total across your workspace
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
        <SynthesesListGrid items={filtered} />
      )}
    </div>
  );
}
