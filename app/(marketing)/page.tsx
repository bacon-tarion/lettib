import Link from "next/link";
import {
  ArrowRight,
  GitCompare,
  Sparkles,
  FolderOpen,
  Brain,
  KeyRound,
  Shield,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PRICING_USD, COMPARE_MODELS_BY_PLAN } from "@/lib/pricing";
import { PricingCards } from "./pricing/pricing-cards";

const PROBLEMS = [
  {
    title: "Scattered across tabs",
    desc: "ChatGPT here, Claude there, Gemini in another window — context lost every time you switch.",
  },
  {
    title: "Rate limited and tracked",
    desc: "Hit caps mid-workflow. Your prompts train someone else's model. Privacy is an afterthought.",
  },
  {
    title: "No way to organize your best work",
    desc: "Great answers disappear in endless threads. Nothing compounds into a knowledge base.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Connect your AI keys",
    desc: "Add OpenAI, Anthropic, Google, Groq, and xAI keys once. Encrypted at rest — you pay providers directly.",
  },
  {
    n: "2",
    title: "Compare answers side by side",
    desc: `Send one prompt to up to ${COMPARE_MODELS_BY_PLAN.power} models in parallel. Watch every response stream live.`,
  },
  {
    n: "3",
    title: "Synthesize the best answer",
    desc: "Merge the strongest ideas into one authoritative answer — saved to your project forever.",
  },
];

const FEATURES = [
  {
    icon: GitCompare,
    title: "Compare Mode",
    headline: "Ask once. See every answer.",
    desc: "Run the same prompt across ChatGPT, Claude, Gemini, and Grok simultaneously. Grade, follow up, and iterate in one workspace.",
  },
  {
    icon: Sparkles,
    title: "LettiB Synthesis",
    headline: "One final answer, built from the best of all models.",
    desc: "Don't pick a winner — combine them. Synthesis merges attributed insights into a single polished response you own.",
  },
  {
    icon: FolderOpen,
    title: "Project folders",
    headline: "Your AI work, organized.",
    desc: "Group chats, compares, and syntheses by project. Search everything. Build a library that grows with you.",
  },
  {
    icon: Brain,
    title: "Project Memory",
    headline: "Every project remembers what matters.",
    desc: "Goals, decisions, preferences, and facts accumulate automatically — so every new prompt starts smarter.",
  },
];

const FAQ = [
  {
    q: "What is BYOK?",
    a: "Bring Your Own Keys. You connect your provider API keys; LettiB orchestrates the workspace. You pay OpenAI, Anthropic, Google, and others directly — zero usage markup.",
  },
  {
    q: "Which AI providers are supported?",
    a: "OpenAI (GPT-5.x), Anthropic (Claude Sonnet & Opus), Google (Gemini), Groq, and xAI (Grok). Custom OpenAI-compatible endpoints work too.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Your keys are encrypted in Supabase Vault. We never train on your conversations. You own everything you create.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Pro and Power are month-to-month — cancel from the billing portal anytime. Lifetime BYOK is a one-time purchase with no renewals.",
  },
  {
    q: "What is LettiB Synthesis?",
    a: "After comparing multiple models, Synthesis merges the best parts into one final answer with source attribution — like having an editor for your AI outputs.",
  },
];

export default function LandingPage() {
  return (
    <div className="bg-background text-foreground">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/40 via-background to-background" />
        <div className="relative mx-auto max-w-6xl px-4 py-24 md:py-32 text-center space-y-8">
          <p className="text-xs uppercase tracking-[0.2em] text-primary font-medium">
            Built for AI power users
          </p>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-4xl mx-auto leading-[1.1]">
            One workspace. Every AI.{" "}
            <span className="text-primary">Your data stays yours.</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Compare ChatGPT, Claude, Gemini, and Grok side by side. Synthesize
            the best answer. Own everything.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button asChild size="lg" className="gap-2">
              <Link href="/signup">
                Start Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-border bg-card/50">
              <Link href="#how-it-works">See how it works</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Problem bar */}
      <section className="border-b border-border py-16">
        <div className="mx-auto max-w-6xl px-4 grid md:grid-cols-3 gap-8">
          {PROBLEMS.map((p) => (
            <div key={p.title} className="space-y-2 text-center md:text-left">
              <h3 className="font-semibold text-foreground">{p.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 border-b border-border">
        <div className="mx-auto max-w-6xl px-4 space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold">How LettiB works</h2>
            <p className="text-muted-foreground">Three steps to a smarter AI workflow.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((s) => (
              <Card key={s.n} className="bg-card border-border">
                <CardContent className="pt-6 space-y-3">
                  <span className="text-3xl font-bold text-primary">{s.n}</span>
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 border-b border-border">
        <div className="mx-auto max-w-6xl px-4 space-y-16">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            const reversed = i % 2 === 1;
            return (
              <div
                key={f.title}
                className={`grid md:grid-cols-2 gap-10 items-center ${
                  reversed ? "md:[direction:rtl]" : ""
                }`}
              >
                <div className={`space-y-4 ${reversed ? "md:[direction:ltr]" : ""}`}>
                  <div className="flex items-center gap-2 text-primary">
                    <Icon className="h-5 w-5" />
                    <span className="text-sm font-medium">{f.title}</span>
                  </div>
                  <h3 className="text-2xl font-bold">{f.headline}</h3>
                  <p className="text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
                <div
                  className={`rounded-xl border border-border bg-elevated aspect-video flex items-center justify-center ${
                    reversed ? "md:[direction:ltr]" : ""
                  }`}
                >
                  <Icon className="h-16 w-16 text-muted-foreground/40" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Privacy */}
      <section className="py-20 border-b border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-success">
              <Shield className="h-5 w-5" />
              <span className="text-sm font-medium">Privacy first</span>
            </div>
            <h2 className="text-3xl font-bold">Your keys. Your data. Your rules.</h2>
            <p className="text-muted-foreground leading-relaxed">
              LettiB never trains on your conversations. Your API keys are
              encrypted and never shared. You own everything you create — export,
              delete, or leave anytime.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: KeyRound, label: "Encrypted keys" },
              { icon: Lock, label: "No training on your data" },
              { icon: Shield, label: "You own your outputs" },
              { icon: Sparkles, label: "BYOK — zero markup" },
            ].map((item) => (
              <Card key={item.label} className="bg-card border-border">
                <CardContent className="pt-5 pb-5 flex flex-col items-center gap-2 text-center">
                  <item.icon className="h-6 w-6 text-primary" />
                  <span className="text-xs text-foreground/80">{item.label}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 border-b border-border">
        <div className="mx-auto max-w-6xl px-4 space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold">Simple, transparent pricing</h2>
            <p className="text-muted-foreground">
              Free forever with BYOK. Upgrade when you need more models and projects.
            </p>
          </div>
          <PricingCards />
          <p className="text-center text-xs text-muted-foreground">
            All paid plans are BYOK — you pay AI providers directly. LettiB charges
            only for the workspace (${PRICING_USD.proMonthly}/mo Pro, $
            {PRICING_USD.powerMonthly}/mo Power, ${PRICING_USD.lifetimeByok}{" "}
            lifetime).
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 border-b border-border">
        <div className="mx-auto max-w-3xl px-4 space-y-8">
          <h2 className="text-3xl font-bold text-center">FAQ</h2>
          <div className="space-y-4">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-lg border border-border bg-card px-4 py-3"
              >
                <summary className="cursor-pointer font-medium list-none flex justify-between items-center">
                  {item.q}
                  <span className="text-muted-foreground group-open:rotate-45 transition-transform">
                    +
                  </span>
                </summary>
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-4 text-center space-y-6">
          <h2 className="text-3xl font-bold">Ready to own your AI workflow?</h2>
          <p className="text-muted-foreground">
            Join AI power users who left the tab chaos behind.
          </p>
          <Button asChild size="lg" className="gap-2">
            <Link href="/signup">
              Start Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
