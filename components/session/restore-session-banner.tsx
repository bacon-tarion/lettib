"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  message?: string;
  onDismiss: () => void;
};

export function RestoreSessionBanner({
  message = "Restored your previous session from this browser.",
  onDismiss,
}: Props) {
  return (
    <div
      className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
      role="status"
    >
      <p className="text-muted-foreground pt-0.5">
        <span className="font-medium text-foreground">Restore previous session?</span>{" "}
        {message}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground"
        onClick={onDismiss}
        aria-label="Dismiss restore notice"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
