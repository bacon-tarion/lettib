import { getModelDisplayName, getProviderLabel } from "@/lib/providers/models";

/** Bracket tag the synthesis model must use for a given API provider. */
export function providerToAttributionTag(provider: string): string {
  switch (provider) {
    case "anthropic":
      return "Claude";
    case "openai":
      return "ChatGPT";
    case "google":
      return "Gemini";
    case "xai":
      return "Grok";
    case "groq":
      return "Groq";
    case "custom":
      return "Custom";
    default:
      return provider.charAt(0).toUpperCase() + provider.slice(1);
  }
}

export function formatCompareResponsesForAttribution(
  rows: { provider: string; model: string; content: string }[]
): string {
  const tagList = rows
    .map((r) => providerToAttributionTag(r.provider))
    .filter((t, i, a) => a.indexOf(t) === i);

  const preamble = `When tagging claims, use exactly these names in square brackets (matching the source of each response): ${tagList.join(", ")}. Use [Consensus] when every model agrees on a point. Do not invent other tag names.\n\n`;

  const blocks = rows.map((r, i) => {
    const tag = providerToAttributionTag(r.provider);
    const label = `${getProviderLabel(r.provider)} — ${getModelDisplayName(r.provider, r.model)}`;
    return `### Response ${i + 1} (tag as [${tag}])\n${label}\n\n${r.content.trim()}`;
  });

  return preamble + blocks.join("\n\n---\n\n");
}
