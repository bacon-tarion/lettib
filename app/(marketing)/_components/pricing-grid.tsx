import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    blurb: "Bring your own keys. Get the full workspace.",
    cta: "Start free",
    href: "/signup",
    highlight: false,
    features: [
      "BYOK — unlimited providers",
      "Compare up to 3 models at once",
      "5 projects",
      "Synthesis (10 / month)",
      "7-day history",
    ],
  },
  {
    name: "Pro",
    price: "$15",
    cadence: "/month",
    blurb: "For daily power users who live in multi-AI workflows.",
    cta: "Upgrade to Pro",
    href: "/signup?plan=pro",
    highlight: true,
    features: [
      "Everything in Free",
      "Compare up to 6 models at once",
      "Unlimited projects",
      "Unlimited Synthesis",
      "Project Memory",
      "Unlimited history & search",
    ],
  },
  {
    name: "Power",
    price: "$35",
    cadence: "/month",
    blurb: "Teams and prosumers running heavy comparisons.",
    cta: "Go Power",
    href: "/signup?plan=power",
    highlight: false,
    features: [
      "Everything in Pro",
      "Compare up to 12 models at once",
      "Custom AI Teams",
      "Shareable synthesis links",
      "Priority synthesis queue",
      "Priority support",
    ],
  },
];

export function PricingGrid() {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {PLANS.map((p) => (
        <Card
          key={p.name}
          className={
            p.highlight
              ? "border-primary shadow-md relative"
              : "border-border/60"
          }
        >
          {p.highlight && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="rounded-full">Most popular</Badge>
            </div>
          )}
          <CardContent className="pt-6 pb-6 space-y-5">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">
                  {p.price}
                </span>
                <span className="text-sm text-muted-foreground">
                  {p.cadence}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{p.blurb}</p>
            </div>
            <Link href={p.href} className="block">
              <Button
                className="w-full"
                variant={p.highlight ? "default" : "outline"}
              >
                {p.cta}
              </Button>
            </Link>
            <ul className="space-y-2 pt-2">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
