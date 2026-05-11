import { MODELS_CATALOG } from "@/lib/providers/models";

export function calcCompareModelCost(
  provider: string,
  model: string,
  tin: number,
  tout: number
): number {
  const catalog = MODELS_CATALOG as Record<
    string,
    readonly { id: string; cost_in: number; cost_out: number }[]
  >;
  const entry = catalog[provider]?.find((m) => m.id === model);
  if (!entry) return 0;
  return (entry.cost_in * tin) / 1_000_000 + (entry.cost_out * tout) / 1_000_000;
}
