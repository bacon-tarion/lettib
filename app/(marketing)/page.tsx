import Link from "next/link";
import {
  ArrowRight,
  GitCompare,
  Sparkles,
  FolderOpen,
  KeyRound,
  Users,
  Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PricingGrid } from "./_components/pricing-grid";

const FEATURES = [
  {
    icon: KeyRound,
    title: "Connect your keys",
    desc: "Bring your own OpenAI, Anthropic, Google, or xAI keys. Your usage, your costs — zero markup.",
  },
  {
    icon: Users,
    title: "AI Teams",
    desc: "Group your favorite models into reusable teams (e.g. 'Research Trio', 'Code Review Squad').",
  },
  {
    icon: GitCompare,
    title: "Compare Mode",
    desc: "Send one prompt to multiple models in parallel. See every answer side by side, in real time.",
  },
  {
    icon: Sparkles,
    title: "LettiB Synthesis",
    desc: "Merge the best parts of every response into one authoritative answer, scored and sourced.",
  },
  {
    icon: FolderOpen,
    title: "Project folders",
    desc: "Organize chats, comparisons, and syntheses into projects. Build a knowledge base that compounds.",
  },
  {
    icon: Brain,
    title: "Project Memory",
    desc: "Capture goals, decisions, preferences, and facts. LettiB carries context from one prompt to the next.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Connect",
    desc: "Add your provider API keys once. Encrypted at rest, only the last 4 chars ever leave the server.",
  },
  {
    n: "02",
    title: "Compare",
    desc: "Pick a Team, type your prompt, and watch every model stream their answer in parallel.",
  },
  {
    n: "03",
    title: "Synthesize",
    desc: "One click merges the best ideas into a single, rated answer saved to your project.",
  },
];

const FAQ = [
  {
    q: "Do you store my API keys?",
    a: "Yes — encrypted in Supabase Vault and decrypted server-side only when needed for a request. We never expose them to the browser, and you can revoke them anytime from Settings.",
  },
  {
    q: "Whose API costs am I paying?",
    a: "Yours. LettiB is BYOK — you bring your own provider keys, and you pay the providers directly. We charge a simple subscription (or a one-time Lifetime BYOK option) for the workspace, with zero usage markup.",
  },
  {
    q: "Which models are supported?",
    a: "OpenAI (GPT-5, o-series), Anthropic (Claude Sonnet & Opus), Google (Gemini), and xAI (Grok). Custom OpenAI-compatible endpoints work too.",
  },
  {
    q: "What is a Synthesis?",
    a: "After a Compare, LettiB sends every model's response to a synthesizer model that produces one merged answer with the best of each — sourced, scored, and saved to your project.",
  },
  {
    q: "Can I share my work?",
    a: "Yes. Any synthesis can be made public via a unique share link. Read-only — your account and other syntheses stay private.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes. The Free plan is BYOK, unlimited providers, with up to 3-model compare and 10 syntheses per month. No credit card required.",
  },
];

export default function MarketingHomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.12),transparent_70%)]"
        />
        <div className="relative mx-auto max-w-4xl px-4 pt-20 pb-16 text-center">
          <Badge variant="secondary" className="mb-6 rounded-full px-3 py-1 text-xs">
            <Sparkles className="h-3 w-3 mr-1.5 inline" />
            Multi-AI workspace · Now in beta
          </Badge>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05] mb-6">
            One workspace for every AI you use.
          </h1>
          <p className="mx-auto max-w-2xl text-lg sm:text-xl text-muted-foreground mb-8">
            Compare GPT, Claude, Gemini, and Grok side by side. Merge the best
            answers into one. Organize everything into projects with memory.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="gap-2 w-full sm:w-auto">
              <Link href="/signup">
                Get started free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href="#how-it-works">See how it works</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            BYOK · No credit card required · Free forever plan
          </p>
        </div>
      </section>

      {/* Problem */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Your AI work is scattered across 5 tabs.
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground text-base sm:text-lg">
            ChatGPT in one tab. Claude in another. Gemini for that one thing.
            Notes in a doc you&apos;ll never find again. Every answer half-right,
            none of them together. LettiB pulls it all into one workspace —
            compare, synthesize, save.
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
              Everything you need to run multi-AI workflows.
            </h2>
            <p className="text-muted-foreground">
              Six features. Zero context switching.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <Card key={f.title} className="border-border/60">
                  <CardContent className="pt-6 pb-6 space-y-3">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold">{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {f.desc}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t bg-muted/30 scroll-mt-20">
        <div className="mx-auto max-w-5xl px-4 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
              Three steps. One smarter answer.
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="rounded-lg border bg-background p-6 space-y-3"
              >
                <span className="text-sm font-mono font-semibold text-primary">
                  {s.n}
                </span>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
              Simple, BYOK pricing.
            </h2>
            <p className="text-muted-foreground">
              You bring the keys. We bring the workspace. No usage markup, ever.
            </p>
          </div>
          <PricingGrid />
          <p className="mt-8 text-center text-xs text-muted-foreground">
            All plans use your own provider API keys. You pay the providers
            directly for their usage.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t bg-muted/30 scroll-mt-20">
        <div className="mx-auto max-w-3xl px-4 py-20">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-10 text-center">
            Frequently asked.
          </h2>
          <div className="space-y-4">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-lg border bg-background p-5 open:shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
                  {item.q}
                  <span className="ml-4 text-muted-foreground transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Try LettiB.
          </h2>
          <p className="mx-auto max-w-xl text-muted-foreground mb-8">
            Bring your keys, run your first compare in under a minute, and see
            the difference a real multi-AI workspace makes.
          </p>
          <Button asChild size="lg" className="gap-2">
            <Link href="/signup">
              Try LettiB
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}

