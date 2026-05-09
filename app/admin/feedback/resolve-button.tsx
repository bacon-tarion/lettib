"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function ResolveButton({
  id,
  resolved,
}: {
  id: string;
  resolved: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/admin/feedback/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: !resolved }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Failed (${res.status})`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={resolved ? "outline" : "default"}
        size="sm"
        onClick={toggle}
        disabled={pending}
        className="gap-1.5 text-xs h-7"
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : resolved ? (
          <>
            <Undo2 className="h-3 w-3" />
            Reopen
          </>
        ) : (
          <>
            <Check className="h-3 w-3" />
            Resolve
          </>
        )}
      </Button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
