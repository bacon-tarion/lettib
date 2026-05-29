"use client";

import { cn } from "@/lib/utils";
import { ANNUAL_BILLING, type BillingInterval } from "@/lib/stripe/checkout-config";

export function BillingIntervalToggle({
  value,
  onChange,
  className,
}: {
  value: BillingInterval;
  onChange: (v: BillingInterval) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 sm:flex-row sm:justify-center",
        className
      )}
    >
      <div className="inline-flex rounded-lg border border-border p-1 bg-muted/40">
        <button
          type="button"
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium transition-colors",
            value === "monthly"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onChange("monthly")}
        >
          Monthly
        </button>
        <button
          type="button"
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium transition-colors",
            value === "annual"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onChange("annual")}
        >
          Annual
        </button>
      </div>
      <p className="text-xs text-muted-foreground text-center sm:text-left">
        Annual billing saves ~{ANNUAL_BILLING.pro.percent}% — Pro $
        {ANNUAL_BILLING.pro.yearly}/yr (vs ${ANNUAL_BILLING.pro.monthlyEquivalent}
        ), Power ${ANNUAL_BILLING.power.yearly}/yr (vs $
        {ANNUAL_BILLING.power.monthlyEquivalent})
      </p>
    </div>
  );
}
