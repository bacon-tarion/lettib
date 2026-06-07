"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  mergeOnboardingStatus,
  parseOnboardingStatusPayload,
  type OnboardingStatus,
} from "@/lib/onboarding/queries";

interface OnboardingBannerProps {
  hasApiKey: boolean;
  hasRunCompare: boolean;
  dismissed: boolean;
}

type Step = {
  label: string;
  complete: boolean;
  href?: string;
};

function propsToStatus({
  hasApiKey,
  hasRunCompare,
  dismissed,
}: OnboardingBannerProps): OnboardingStatus {
  return { hasApiKey, hasRunCompare, dismissed };
}

export function OnboardingBanner({
  hasApiKey,
  hasRunCompare,
  dismissed,
}: OnboardingBannerProps) {
  const [status, setStatus] = useState<OnboardingStatus>(() =>
    propsToStatus({ hasApiKey, hasRunCompare, dismissed })
  );
  const [hidden, setHidden] = useState(false);

  const applyStatus = useCallback((next: OnboardingStatus) => {
    setStatus((prev) => mergeOnboardingStatus(prev, next));
  }, []);

  useEffect(() => {
    applyStatus(propsToStatus({ hasApiKey, hasRunCompare, dismissed }));
  }, [hasApiKey, hasRunCompare, dismissed, applyStatus]);

  useEffect(() => {
    let cancelled = false;

    async function refreshStatus() {
      try {
        const res = await fetch(`/api/onboarding/status?_=${Date.now()}`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const json: unknown = await res.json();
        console.log("[onboarding] status response:", JSON.stringify(json));
        const parsed = parseOnboardingStatusPayload(json);
        if (!parsed || cancelled) return;
        applyStatus(parsed);
      } catch (err) {
        console.error("[onboarding] status refresh failed:", err);
      }
    }

    void refreshStatus();

    function onFocus() {
      void refreshStatus();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refreshStatus();
      }
    }

    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        void refreshStatus();
      }
    }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [applyStatus]);

  if (
    status.dismissed ||
    hidden ||
    (status.hasApiKey && status.hasRunCompare)
  ) {
    return null;
  }

  const steps: Step[] = [
    { label: "Create your account", complete: true },
    {
      label: "Add an API key",
      complete: status.hasApiKey,
      href: "/settings?tab=api-keys",
    },
    {
      label: "Run your first compare",
      complete: status.hasRunCompare,
      href: "/compare",
    },
  ];

  async function handleDismiss() {
    setHidden(true);
    applyStatus({ hasApiKey: status.hasApiKey, hasRunCompare: status.hasRunCompare, dismissed: true });
    try {
      const res = await fetch("/api/onboarding/dismiss", { method: "POST" });
      if (!res.ok) {
        console.error("[onboarding/dismiss] request failed:", res.status);
      }
    } catch (err) {
      console.error("[onboarding/dismiss] request failed:", err);
    }
  }

  return (
    <div className="relative rounded-lg border border-border bg-card p-5 text-foreground">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-8 w-8 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss onboarding checklist"
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" />
      </Button>

      <h2 className="text-sm font-semibold pr-8">Get started with LettiB</h2>

      <ol className="mt-3 space-y-2">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-2.5 text-sm">
            {step.complete ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            {step.complete || !step.href ? (
              <span
                className={
                  step.complete ? "text-foreground" : "text-muted-foreground"
                }
              >
                {step.label}
              </span>
            ) : (
              <Link href={step.href} className="text-primary hover:underline">
                {step.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
