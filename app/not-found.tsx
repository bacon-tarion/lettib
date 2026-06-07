export const dynamic = "force-dynamic";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(239 84% 67% / 0.15), transparent 70%), linear-gradient(to bottom, hsl(249 50% 8%), hsl(249 43% 12%))",
        }}
      />
      <Link
        href="/"
        className="relative z-10 mb-8 flex items-center gap-2 font-semibold"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </span>
        LettiB
      </Link>
      <Card className="relative z-10 w-full max-w-sm shadow-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">404 — Page not found</CardTitle>
          <CardDescription>
            The page you are looking for does not exist or may have been moved.
            Let us get you back on track.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <Button asChild className="w-full">
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to Home
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
