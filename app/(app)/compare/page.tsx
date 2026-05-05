"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResponseCard } from "@/components/compare/response-card";
import { mockTeams, mockProjects } from "@/lib/mockData";

const MOCK_RESPONSES = [
  {
    provider: "anthropic",
    model: "claude-opus-4-7",
    content:
      "TypeScript with Next.js is the strongest default choice for solo SaaS founders in 2026. The ecosystem is mature, AI coding tools work best with it, and Supabase + Vercel provide a near-zero-DevOps path to production.",
    latencyMs: 842,
    tokenCount: 312,
  },
  {
    provider: "openai",
    model: "gpt-5.4",
    content:
      "For a solo founder, Next.js 14 with the App Router is the clear winner. Server components eliminate most client-side complexity, and the Vercel deployment story is unmatched. Pair with Supabase for a full production backend in days.",
    latencyMs: 1104,
    tokenCount: 287,
  },
  {
    provider: "google",
    model: "gemini-3.1-pro",
    content:
      "Next.js remains the top pick in 2026. Its hybrid rendering model handles both content and SaaS use-cases well. The key advantage for solo founders is the tight AI SDK integration — streaming responses, tool calls, and structured outputs all work out of the box.",
    latencyMs: 967,
    tokenCount: 341,
  },
];

export default function ComparePage() {
  const [prompt, setPrompt] = useState("");
  const [ran, setRan] = useState(true);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Compare</h1>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Select defaultValue="proj-1">
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            {mockProjects.map((p) => (
              <SelectItem key={p.id} value={p.id} className="text-xs">
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select defaultValue="team-1">
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="AI Team" />
          </SelectTrigger>
          <SelectContent>
            {mockTeams.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-xs">
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select defaultValue="professional">
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Tone" />
          </SelectTrigger>
          <SelectContent>
            {["professional", "technical", "friendly", "concise"].map((t) => (
              <SelectItem key={t} value={t} className="text-xs capitalize">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Textarea
        placeholder="Enter your prompt and run it across all models in the selected team…"
        className="resize-none min-h-[100px]"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <div className="flex items-center gap-3 rounded-lg bg-muted/50 border px-4 py-2.5 text-sm text-muted-foreground">
        <span className="text-base">💡</span>
        <span>
          Estimated cost across 3 models:{" "}
          <strong className="text-foreground">$0.04 – $0.09</strong>
        </span>
      </div>

      <Button className="gap-2" onClick={() => setRan(true)}>
        <Zap className="h-4 w-4" />
        Run Compare
      </Button>

      {ran && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MOCK_RESPONSES.map((r) => (
              <ResponseCard key={r.provider} {...r} />
            ))}
          </div>

          <Button className="w-full gap-2" variant="default">
            <span>✨</span>
            Create LettiB Synthesis
          </Button>
        </div>
      )}
    </div>
  );
}
