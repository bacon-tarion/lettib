/** How compare / synthesis API keys are sourced. */
export type CompareKeyMode = "manual" | "byok";

export function parseCompareKeyMode(value: unknown): CompareKeyMode | null {
  if (value === "manual" || value === "byok") return value;
  return null;
}

export const DEFAULT_COMPARE_KEY_MODE: CompareKeyMode = "byok";
