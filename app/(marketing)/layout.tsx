import Link from "next/link";
import nextDynamic from "next/dynamic";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Avoid static prerender — shared client islands (Button, PricingCards) use navigation hooks. */
export const dynamic = "force-dynamic";

const MarketingToaster = nextDynamic(
  () =>
    import("@/components/ui/marketing-toaster").then(
      (mod) => mod.MarketingToaster
    ),
  { ssr: false }
);

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl flex h-14 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            LettiB
          </Link>
          <nav className="hidden sm:flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/#features" className="hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="/#how-it-works" className="hover:text-foreground transition-colors">
              How it works
            </Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="/#faq" className="hover:text-foreground transition-colors">
              FAQ
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground hidden sm:inline-block">
              Sign in
            </Link>
            <Button asChild size="sm">
              <Link href="/signup">Start Free</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-10 grid gap-8 sm:grid-cols-4 text-sm">
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Sparkles className="h-3 w-3" />
              </span>
              LettiB
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Built for AI power users.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Product
            </p>
            <ul className="space-y-1.5">
              <li>
                <Link href="/#features" className="text-muted-foreground hover:text-foreground">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-muted-foreground hover:text-foreground">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="text-muted-foreground hover:text-foreground">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Account
            </p>
            <ul className="space-y-1.5">
              <li>
                <Link href="/login" className="text-muted-foreground hover:text-foreground">
                  Sign in
                </Link>
              </li>
              <li>
                <Link href="/signup" className="text-muted-foreground hover:text-foreground">
                  Sign up
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Legal
            </p>
            <ul className="space-y-1.5">
              <li>
                <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-muted-foreground hover:text-foreground">
                  Terms and Conditions
                </Link>
              </li>
              <li>
                <Link href="/cookie-policy" className="text-muted-foreground hover:text-foreground">
                  Cookie Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t">
          <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted-foreground">
            © {new Date().getFullYear()} LettiB. All rights reserved.
          </div>
        </div>
      </footer>
      <MarketingToaster />
    </div>
  );
}
