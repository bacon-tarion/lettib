import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PRICING_PLANS } from "@/lib/pricing";

export function PricingGrid() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {PRICING_PLANS.map((p) => (
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
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {p.cadence}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{p.blurb}</p>
            </div>
            <Button
              asChild
              className="w-full"
              variant={p.highlight ? "default" : "outline"}
            >
              <Link href={p.href}>{p.cta}</Link>
            </Button>
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
