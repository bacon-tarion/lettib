import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, GitCompare, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  MODELS_CATALOG,
  getModelDisplayName,
  getProviderLabel,
} from "@/lib/providers/models";
import { cn } from "@/lib/utils";
import { ChatViewerActions } from "./chat-viewer-actions";

export const dynamic = "force-dynamic";

const PROVIDER_BG: Record<string, string> = {
  openai: "bg-blue-500",
  anthropic: "bg-amber-500",
  google: "bg-green-500",
  xai: "bg-purple-500",
  custom: "bg-gray-500",
};

// Statically declared so Tailwind JIT emits these classes (it cannot see
// runtime-built strings like `border-l-${color}`).
const PROVIDER_BORDER: Record<string, string> = {
  openai: "border-l-blue-500",
  anthropic: "border-l-amber-500",
  google: "border-l-green-500",
  xai: "border-l-purple-500",
  custom: "border-l-gray-500",
};

function calcCost(
  provider: string | null,
  model: string | null,
  tin: number,
  tout: number
) {
  if (!provider || !model) return 0;
  const catalog = MODELS_CATALOG as Record<
    string,
    readonly { id: string; cost_in: number; cost_out: number }[]
  >;
  const entry = catalog[provider]?.find((m) => m.id === model);
  if (!entry) return 0;
  return (entry.cost_in * tin) / 1_000_000 + (entry.cost_out * tout) / 1_000_000;
}

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider: string | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string;
};

type ModelResponseRow = {
  id: string;
  provider: string;
  model: string;
  content: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  latency_ms: number;
  error: string | null;
  score_accuracy: number | null;
  score_clarity: number | null;
  score_creativity: number | null;
  score_usefulness: number | null;
  score_risk: number | null;
  position: number;
};

export default async function ChatViewerPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sc = createServiceClient();

  const { data: convData } = await sc
    .from("conversations")
    .select(
      "id, user_id, project_id, title, mode, provider, model, created_at, updated_at, deleted_at, projects(name)"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!convData || (convData as { user_id: string }).user_id !== user.id) {
    notFound();
  }
  const conv = convData as unknown as {
    id: string;
    user_id: string;
    project_id: string | null;
    title: string;
    mode: "chat" | "compare";
    provider: string | null;
    model: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    projects: { name: string } | null;
  };
  if (conv.deleted_at) notFound();

  if (conv.mode === "chat") {
    redirect(`/chat?conversation=${encodeURIComponent(conv.id)}`);
  }

  const [{ data: messages }, modelResponsesRes, { data: projects }] =
    await Promise.all([
      sc
        .from("messages")
        .select(
          "id, role, content, provider, model, tokens_in, tokens_out, created_at"
        )
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true }),
      conv.mode === "compare"
        ? sc
            .from("model_responses")
            .select(
              "id, provider, model, content, tokens_in, tokens_out, cost_usd, latency_ms, error, score_accuracy, score_clarity, score_creativity, score_usefulness, score_risk, position"
            )
            .eq("conversation_id", conv.id)
            .order("position", { ascending: true })
        : Promise.resolve({ data: [] }),
      sc
        .from("projects")
        .select("id, name")
        .eq("user_id", user.id)
        .eq("archived", false)
        .order("name"),
    ]);

  const allMessages = (messages ?? []) as Message[];
  const modelResponses = (modelResponsesRes.data ?? []) as ModelResponseRow[];
  const userProjects = (projects ?? []) as { id: string; name: string }[];

  const ModeIcon = conv.mode === "compare" ? GitCompare : MessageSquare;

  // Chat conversations redirect to the interactive /chat workspace above.
  const userPrompt = allMessages.find((m) => m.role === "user");
  const chatMessages = userPrompt ? [userPrompt] : [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-2">
        {conv.project_id ? (
          <Link
            href={`/projects/${conv.project_id}/chats`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Back to {conv.projects?.name ?? "project"} chats
          </Link>
        ) : (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Back to dashboard
          </Link>
        )}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{conv.title}</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="gap-1 text-[10px]">
                <ModeIcon className="h-3 w-3" />
                {conv.mode}
              </Badge>
              {conv.provider && conv.model && (
                <span>
                  {getProviderLabel(conv.provider)} ·{" "}
                  {getModelDisplayName(conv.provider, conv.model)}
                </span>
              )}
              <span>·</span>
              <span>{new Date(conv.created_at).toLocaleString()}</span>
            </div>
          </div>
          <ChatViewerActions
            conversationId={conv.id}
            currentProjectId={conv.project_id}
            projects={userProjects}
          />
        </div>
      </div>

      {/* Thread */}
      <div className="space-y-4">
        {chatMessages.map((m) => {
          const cost = calcCost(
            m.provider,
            m.model,
            m.tokens_in ?? 0,
            m.tokens_out ?? 0
          );
          const totalTokens = (m.tokens_in ?? 0) + (m.tokens_out ?? 0);
          const isUser = m.role === "user";
          return (
            <div
              key={m.id}
              className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}
            >
              <div
                className={cn(
                  "rounded-2xl px-4 py-3 max-w-[85%] whitespace-pre-wrap text-sm leading-relaxed",
                  isUser
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                )}
              >
                {m.content}
              </div>
              {!isUser && (m.provider || totalTokens > 0) && (
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums px-1">
                  {m.provider && m.model && (
                    <span>{getModelDisplayName(m.provider, m.model)}</span>
                  )}
                  {totalTokens > 0 && <span>{totalTokens} tok</span>}
                  {cost > 0 && <span>${cost.toFixed(5)}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Compare-mode side-by-side */}
      {conv.mode === "compare" && modelResponses.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Model Responses
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modelResponses.map((r) => {
              const styleBg = PROVIDER_BG[r.provider] ?? "bg-gray-400";
              const styleBorder =
                PROVIDER_BORDER[r.provider] ?? "border-l-gray-400";
              const totalTokens = r.tokens_in + r.tokens_out;
              return (
                <Card
                  key={r.id}
                  className={cn(
                    "flex flex-col h-full border-l-4",
                    styleBorder
                  )}
                >
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0",
                          styleBg
                        )}
                      >
                        {(r.provider[0] ?? "?").toUpperCase()}
                      </div>
                      <span className="text-xs font-medium truncate flex-1">
                        {getModelDisplayName(r.provider, r.model)}
                      </span>
                      {r.latency_ms > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          {r.latency_ms}ms
                        </Badge>
                      )}
                    </div>
                    {r.error ? (
                      <p className="text-xs text-destructive">{r.error}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {r.content}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums pt-2 border-t">
                      <span>{totalTokens} tok</span>
                      <span>${r.cost_usd.toFixed(5)}</span>
                    </div>
                    {r.score_accuracy !== null && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {[
                          ["A", r.score_accuracy],
                          ["C", r.score_clarity],
                          ["Cr", r.score_creativity],
                          ["U", r.score_usefulness],
                          ["R", r.score_risk],
                        ].map(([label, value]) => (
                          <span
                            key={label as string}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-medium"
                          >
                            {label} {value as number}
                          </span>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
