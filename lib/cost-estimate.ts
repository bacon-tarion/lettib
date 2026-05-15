/**
 * Pre-spend cost estimator (client-side, no backend, no DB).
 *
 * Used by the Compare and Chat composers to show an inline "Estimated:
 * ~$0.04–0.11" hint near the Send / Run button. It MUST stay pure & cheap:
 * called on every keystroke and every model-selection change.
 *
 * The per-token rates live in `lib/providers/models.ts` as USD per million
 * tokens (the canonical provider-billing format). We sister-import from
 * there so this file and `lib/pricing.ts` (which holds public plan / tier
 * info) stay decoupled.
 *
 * Output assumptions per model:
 *   low  = 200  output tokens   (a terse / single-paragraph answer)
 *   high = 1200 output tokens   (a long-form / structured answer)
 *
 * Input tokens are estimated from prompt characters using the standard
 * chars / 4 rule of thumb. This is intentionally rough — the goal is a
 * subtle order-of-magnitude hint, not an invoice.
 */

import {
  MODELS_CATALOG,
  getProviderForModel,
  type ModelEntry,
} from "@/lib/providers/models";

export const OUTPUT_TOKENS_LOW = 200;
export const OUTPUT_TOKENS_HIGH = 1200;

const CHARS_PER_TOKEN = 4;

/** Result is in cents (integer-friendly), rounded to 2 fractional digits. */
export type CostEstimateCents = { low: number; high: number };

function findModelEntry(modelId: string): ModelEntry | undefined {
  const catalog = MODELS_CATALOG as Record<string, readonly ModelEntry[]>;
  const provider = getProviderForModel(modelId);
  if (!provider) return undefined;
  return catalog[provider]?.find((m) => m.id === modelId);
}

function estimateInputTokens(promptText: string): number {
  if (!promptText) return 0;
  return Math.ceil(promptText.length / CHARS_PER_TOKEN);
}

/**
 * Estimate the cost in CENTS for a Compare call across `modelIds`.
 *
 * cost_in / cost_out from the catalog are dollars per 1,000,000 tokens, so:
 *   usd  = (cost_in * tokensIn + cost_out * tokensOut) / 1e6
 *   cents = usd * 100
 *
 * Unknown / custom model ids contribute 0 (we don't know their rates).
 */
export function estimateCompareCost(
  promptText: string,
  modelIds: string[]
): CostEstimateCents {
  const tokensIn = estimateInputTokens(promptText);

  let lowCents = 0;
  let highCents = 0;

  for (const id of modelIds) {
    const entry = findModelEntry(id);
    if (!entry) continue;

    const inUsd = (entry.cost_in * tokensIn) / 1_000_000;
    const outLowUsd = (entry.cost_out * OUTPUT_TOKENS_LOW) / 1_000_000;
    const outHighUsd = (entry.cost_out * OUTPUT_TOKENS_HIGH) / 1_000_000;

    lowCents += (inUsd + outLowUsd) * 100;
    highCents += (inUsd + outHighUsd) * 100;
  }

  return {
    low: Math.round(lowCents * 100) / 100,
    high: Math.round(highCents * 100) / 100,
  };
}

/** Convenience wrapper for the single-model Chat composer. */
export function estimateChatCost(
  promptText: string,
  modelId: string
): CostEstimateCents {
  return estimateCompareCost(promptText, [modelId]);
}

/** Format cents as a short USD string for the inline hint. */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  if (dollars < 0.01) return "<$0.01";
  if (dollars < 1) return `$${dollars.toFixed(2)}`;
  return `$${dollars.toFixed(2)}`;
}

export function formatCostRange(range: CostEstimateCents): string {
  if (range.high === 0) return "$0.00";
  if (range.low === range.high) return formatCents(range.low);
  return `${formatCents(range.low)}–${formatCents(range.high)}`;
}
