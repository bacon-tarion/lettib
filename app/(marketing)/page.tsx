import Link from "next/link";
import { ArrowRight, GitCompare, Sparkles, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const VALUE_PROPS = [
  {
    icon: GitCompare,
    title: "Compare",
    desc: "Run the same prompt across GPT-5, Claude, and Gemini simultaneously. See every answer side by side.",
  },
  {
    icon: Sparkles,
    title: "Synthesize",
    desc: "Let LettiB merge the best parts of every response into one authoritative answer.",
  },
  {
    icon: FolderOpen,
    title: "Organize",
    desc: "Save chats, comparisons, and syntheses into projects. Build a knowledge base that compounds.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Bring your API keys",
    desc: "Connect OpenAI, Anthropic, Google, or xAI. Your keys, your costs — no markup.",
  },
  {
    step: "2",
    title: "Run a Compare",
    desc: "Type a prompt, select your AI Team, and see all responses in under a second.",
  },
  {
    step: "3",
    title: "Create a Synthesis",
    desc: "One click merges the best ideas into a single, rated answer saved to your project.",
  },
];

export default function MarketingHomePage() {
  return (
    <div className="min-h-screen bg-background">
      <section className="flex flex-col items-center justify-center text-center px-4 pt-24 pb-20 max-w-3xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-6">
          Your AI work, finally organized.
        </h1>
        <p className="text-lg text-muted-foreground mb-8 max-w-xl">
          Compare GPT-5, Claude, and Gemini side by side. Merge the best parts into
          one answer. Save everything into projects.
        </p>
        <div className="flex gap-3 flex-wrap justify-center">
          <Link href="/signup">
            <Button size="lg" className="gap-2">
              Join the beta
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="#how-it-works">
            <Button size="lg" variant="outline">
              See how it works
            </Button>
          </Link>
        </div>
      </section>

      <section className="px-4 py-16 max-w-4xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {VALUE_PROPS.map((v) => {
            const Icon = v.icon;
            return (
              <Card key={v.title} className="text-center">
                <CardHeader className="pb-2">
                  <div className="mx-auto rounded-full bg-muted p-3 w-fit mb-2">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">{v.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{v.desc}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section id="how-it-works" className="px-4 py-16 bg-muted/30">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10">How it works</h2>
          <div className="space-y-6">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step} className="flex gap-4 items-start">
                <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
                  {step.step}
                </div>
                <div>
                  <p className="font-semibold">{step.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t px-4 py-8 text-center text-sm text-muted-foreground">
        <div className="flex gap-6 justify-center">
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms
          </Link>
          <Link href="/roadmap" className="hover:text-foreground transition-colors">
            Roadmap
          </Link>
        </div>
        <p className="mt-4">© 2026 LettiB. All rights reserved.</p>
      </footer>
    </div>
  );
}
