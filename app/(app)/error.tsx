"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Send to server console; visible in Vercel/host logs without exposing
    // the message body to end users.
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <div className="rounded-full bg-destructive/10 p-3">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <div className="space-y-1 max-w-md">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          We hit an unexpected error loading this page. Try again, or head back
          home if it keeps happening.
        </p>
        {error.digest && (
          <p className="text-[11px] text-muted-foreground/70 pt-2 tabular-nums">
            Error ID: {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset} size="sm">
          Try again
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href="/dashboard">Go home</a>
        </Button>
      </div>
    </div>
  );
}
