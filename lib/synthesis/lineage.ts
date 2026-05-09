export interface LineageSentence {
  sentence: string;
  model: string;
}

export interface ConflictPosition {
  model: string;
  claim: string;
}

export interface Conflict {
  id: string;
  topic: string;
  positions: ConflictPosition[];
}

/**
 * Provider → canonical lineage slug used in [tag] markers.
 * The synth prompt tells the model to use these short slugs; we expose them
 * here both for the prompt's SOURCES list and for color mapping in the UI.
 */
export function providerToSlug(provider: string): string {
  switch (provider) {
    case "anthropic":
      return "claude";
    case "openai":
      return "gpt";
    case "google":
      return "gemini";
    case "groq":
      return "groq";
    case "xai":
      return "grok";
    default:
      return provider.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  }
}

const SLUG_TO_PROVIDER: Record<string, string> = {
  claude: "anthropic",
  gpt: "openai",
  gemini: "google",
  groq: "groq",
  grok: "xai",
};
export function slugToProvider(slug: string): string {
  return SLUG_TO_PROVIDER[slug] ?? slug;
}

/** Strip the conflicts fenced block from the model's raw output. */
export function extractConflictsBlock(raw: string): {
  conflicts: Conflict[];
  bodyWithoutBlock: string;
} {
  const fence = raw.match(/```conflicts\s*([\s\S]*?)```/i);
  if (!fence) return { conflicts: [], bodyWithoutBlock: raw };
  let conflicts: Conflict[] = [];
  try {
    const parsed = JSON.parse(fence[1].trim());
    if (Array.isArray(parsed)) {
      conflicts = parsed
        .filter(
          (c): c is Conflict =>
            c &&
            typeof c === "object" &&
            typeof c.id === "string" &&
            typeof c.topic === "string" &&
            Array.isArray(c.positions)
        )
        .map((c) => ({
          id: c.id,
          topic: c.topic,
          positions: c.positions
            .filter(
              (p) =>
                p &&
                typeof p === "object" &&
                typeof p.model === "string" &&
                typeof p.claim === "string"
            )
            .map((p) => ({ model: p.model, claim: p.claim })),
        }));
    }
  } catch {
    // ignore — leave conflicts as []
  }
  const body = raw.replace(fence[0], "").trim();
  return { conflicts, bodyWithoutBlock: body };
}

/**
 * Parse [tag]-annotated prose into an ordered list of (sentence, model) pairs
 * AND return a clean string with the tags stripped, suitable for plain copy.
 *
 * Heuristic: split on sentence-ending punctuation followed by a [tag]. The tag
 * applies to everything since the previous tag (or start of text). Untagged
 * tail text is attributed to "synth".
 */
export function parseLineage(body: string): {
  lineage: LineageSentence[];
  plainText: string;
} {
  const lineage: LineageSentence[] = [];
  const plainParts: string[] = [];
  // Match a chunk of text up to and including a [slug] tag.
  const tagRe = /([\s\S]*?)\[([a-z0-9][a-z0-9-]*)\]/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(body)) !== null) {
    const chunk = match[1].trim();
    const model = match[2].toLowerCase();
    if (chunk) {
      lineage.push({ sentence: chunk, model });
      plainParts.push(chunk);
    }
    lastIndex = tagRe.lastIndex;
  }
  const tail = body.slice(lastIndex).trim();
  if (tail) {
    lineage.push({ sentence: tail, model: "synth" });
    plainParts.push(tail);
  }
  return { lineage, plainText: plainParts.join(" ") };
}
