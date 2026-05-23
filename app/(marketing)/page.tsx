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
import { PricingGrid } from "./_components/pricing-grid";
import { PRICING_USD, COMPARE_MODELS_BY_PLAN } from "@/lib/pricing";

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
    <div className="bg-zinc-950 text-zinc-100">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-zinc-800">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-violet-950/40 via-zinc-950 to-zinc-950" />
        <div className="relative mx-auto max-w-6xl px-4 py-24 md:py-32 text-center space-y-8">
          <p className="text-xs uppercase tracking-[0.2em] text-violet-400 font-medium">
            Built for AI power users
          </p>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-4xl mx-auto leading-[1.1]">
            One workspace. Every AI.{" "}
            <span className="text-violet-400">Your data stays yours.</span>
          </h1>
          <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
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
            <Button asChild size="lg" variant="outline" className="border-zinc-700 bg-transparent">
              <Link href="#how-it-works">See how it works</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Problem bar */}
      <section className="border-b border-zinc-800 py-16">
        <div className="mx-auto max-w-6xl px-4 grid md:grid-cols-3 gap-8">
          {PROBLEMS.map((p) => (
            <div key={p.title} className="space-y-2 text-center md:text-left">
              <h3 className="font-semibold text-zinc-100">{p.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 border-b border-zinc-800">
        <div className="mx-auto max-w-6xl px-4 space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold">How LettiB works</h2>
            <p className="text-zinc-400">Three steps to a smarter AI workflow.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((s) => (
              <Card key={s.n} className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="pt-6 space-y-3">
                  <span className="text-3xl font-bold text-violet-500">{s.n}</span>
                  <h3 className="font-semibold">{s.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 border-b border-zinc-800">
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
                  <div className="flex items-center gap-2 text-violet-400">
                    <Icon className="h-5 w-5" />
                    <span className="text-sm font-medium">{f.title}</span>
                  </div>
                  <h3 className="text-2xl font-bold">{f.headline}</h3>
                  <p className="text-zinc-400 leading-relaxed">{f.desc}</p>
                </div>
                <div
                  className={`rounded-xl border border-zinc-800 bg-zinc-900/60 aspect-video flex items-center justify-center ${
                    reversed ? "md:[direction:ltr]" : ""
                  }`}
                >
                  <Icon className="h-16 w-16 text-zinc-700" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Privacy */}
      <section className="py-20 border-b border-zinc-800 bg-zinc-900/30">
        <div className="mx-auto max-w-6xl px-4 grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-400">
              <Shield className="h-5 w-5" />
              <span className="text-sm font-medium">Privacy first</span>
            </div>
            <h2 className="text-3xl font-bold">Your keys. Your data. Your rules.</h2>
            <p className="text-zinc-400 leading-relaxed">
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
              <Card key={item.label} className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="pt-5 pb-5 flex flex-col items-center gap-2 text-center">
                  <item.icon className="h-6 w-6 text-violet-400" />
                  <span className="text-xs text-zinc-300">{item.label}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 border-b border-zinc-800">
        <div className="mx-auto max-w-6xl px-4 space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold">Simple, transparent pricing</h2>
            <p className="text-zinc-400">
              Free forever with BYOK. Upgrade when you need more models and projects.
            </p>
          </div>
          <PricingGrid dark />
          <p className="text-center text-xs text-zinc-500">
            All paid plans are BYOK — you pay AI providers directly. LettiB charges
            only for the workspace (${PRICING_USD.proMonthly}/mo Pro, $
            {PRICING_USD.powerMonthly}/mo Power, ${PRICING_USD.lifetimeByok}{" "}
            lifetime).
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 border-b border-zinc-800">
        <div className="mx-auto max-w-3xl px-4 space-y-8">
          <h2 className="text-3xl font-bold text-center">FAQ</h2>
          <div className="space-y-4">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3"
              >
                <summary className="cursor-pointer font-medium list-none flex justify-between items-center">
                  {item.q}
                  <span className="text-zinc-500 group-open:rotate-45 transition-transform">
                    +
                  </span>
                </summary>
                <p className="text-sm text-zinc-400 mt-3 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-4 text-center space-y-6">
          <h2 className="text-3xl font-bold">Ready to own your AI workflow?</h2>
          <p className="text-zinc-400">
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
