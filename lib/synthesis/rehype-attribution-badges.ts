import { visit } from "unist-util-visit";
import type { Element, ElementContent, Parent, Root, Text } from "hast";

/**
 * Matches bracket attribution tags like [Claude] [Gemini] [Consensus] but not
 * markdown links [label](url) or reference-style [label][ref].
 */
const ATTRIB_SPLIT = /\[([^\]\n]+)\](?!\(|\[)/g;

function isAttributionCandidate(inner: string): boolean {
  const t = inner.trim();
  if (t.length < 2 || t.length > 48) return false;
  if (/https?:\/\//i.test(t)) return false;
  if (/^\d+$/.test(t)) return false;

  const low = t.toLowerCase();
  const slugish =
    /^(claude|gemini|consensus|gpt|grok|groq|synthesizer|openai|chatgpt|synth)([-\s].*)?$/i;
  if (slugish.test(t)) return true;

  if (/^[A-Z][a-zA-Z0-9.\s-]{1,28}$/.test(t)) return true;
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}$/.test(t)) return true;

  if (/^[a-z][a-z0-9-]{1,20}$/.test(low) && low.length <= 24) return true;

  return false;
}

function badgeClassForLabel(label: string): string {
  const k = label.toLowerCase();
  if (k.includes("consensus"))
    return "border-violet-500/40 bg-violet-500/15 text-violet-950 dark:text-violet-100";
  if (k.includes("claude"))
    return "border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-100";
  if (k.includes("gemini"))
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100";
  if (k.includes("gpt") || k.includes("openai") || k.includes("chatgpt"))
    return "border-sky-500/40 bg-sky-500/15 text-sky-950 dark:text-sky-100";
  if (k.includes("grok"))
    return "border-purple-500/40 bg-purple-500/15 text-purple-950 dark:text-purple-100";
  if (k.includes("groq"))
    return "border-orange-500/40 bg-orange-500/15 text-orange-950 dark:text-orange-100";
  if (k.includes("synth"))
    return "border-muted-foreground/40 bg-muted text-foreground";
  return "border-border bg-muted/80 text-foreground";
}

function createBadgeElement(label: string): Element {
  const display = label.trim();
  const tone = badgeClassForLabel(display);
  return {
    type: "element",
    tagName: "span",
    properties: {
      className: [
        "inline-flex",
        "items-center",
        "align-middle",
        "rounded-md",
        "border",
        "px-1.5",
        "py-0.5",
        "text-[11px]",
        "font-semibold",
        "leading-none",
        "mx-0.5",
        "max-w-full",
        "break-words",
        tone,
      ],
    },
    children: [{ type: "text", value: display }],
  };
}

function parentIsCode(parent: Parent | undefined): boolean {
  return Boolean(
    parent && parent.type === "element" && (parent as Element).tagName === "code"
  );
}

/**
 * rehype plugin: turn [Model] attribution markers in prose into styled spans.
 * Skips text inside <code> (inline or fenced).
 */
export function rehypeAttributionBadges() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
      if (parentIsCode(parent)) return;
      if (parent === undefined || typeof index !== "number") return;
      if (parent.type !== "element") return;

      const value = node.value;
      if (!value.includes("[") || !value.includes("]")) return;

      const parts: ElementContent[] = [];
      let last = 0;
      const re = new RegExp(ATTRIB_SPLIT.source, ATTRIB_SPLIT.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(value)) !== null) {
        if (m.index > last) {
          parts.push({ type: "text", value: value.slice(last, m.index) });
        }
        const inner = m[1]!.trim();
        if (isAttributionCandidate(inner)) {
          parts.push(createBadgeElement(inner));
        } else {
          parts.push({ type: "text", value: m[0]! });
        }
        last = m.index + m[0]!.length;
      }
      if (last < value.length) {
        parts.push({ type: "text", value: value.slice(last) });
      }

      if (
        parts.length === 1 &&
        parts[0]!.type === "text" &&
        parts[0].value === value
      ) {
        return;
      }

      (parent as Element).children.splice(index, 1, ...parts);
    });
  };
}
