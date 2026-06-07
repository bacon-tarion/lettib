import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Avoid static prerender — auth forms use useSearchParams inside Suspense. */
export const dynamic = "force-dynamic";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
        className="absolute top-4 left-4 sm:top-6 sm:left-6 z-10 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>
      <div className="mb-8 relative z-10">
        <Link href="/" className="text-xl font-bold tracking-tight select-none">
          LettiB
        </Link>
      </div>
      <div className="relative z-10 w-full flex justify-center">{children}</div>
    </div>
  );
}
