export const SCORING_PROMPT = `You are evaluating multiple AI responses to the same user prompt. Score each response on five dimensions, 1-10:

- accuracy: Is the content factually correct given what's verifiable?
- clarity: Is it well-structured, readable, and easy to follow?
- creativity: Does it offer novel angles, useful framing, or fresh insight?
- usefulness: How actionable is it for the user's actual question?
- risk: Likelihood of misleading or harming the user (1 = very safe, 10 = high risk).

Be calibrated — most responses are 5-8 on most dimensions. Reserve 9-10 for genuinely outstanding work and 1-2 for clearly broken or harmful output.

Return ONLY valid JSON in this exact shape — no markdown, no preamble, no commentary:

{
  "scores": [
    {"key": "<key>", "accuracy": <n>, "clarity": <n>, "creativity": <n>, "usefulness": <n>, "risk": <n>}
  ]
}

USER PROMPT:
{{prompt}}

RESPONSES:
{{responses}}`;

export function buildScoringMessage(
  prompt: string,
  responses: { key: string; provider: string; model: string; content: string }[]
): string {
  const formatted = responses
    .map(
      (r, i) =>
        `### Response ${i + 1} — key: ${r.key} (${r.provider} / ${r.model})\n${r.content}`
    )
    .join("\n\n");

  const keyList = responses.map((r) => `"${r.key}"`).join(", ");
  const requirement = `\n\nIMPORTANT: You MUST return exactly ${responses.length} score object(s) — one per response — using these keys in this order: [${keyList}]. Score every response, INCLUDING any response you may have authored yourself. Do not skip any key. Do not add keys that are not in this list.`;

  return SCORING_PROMPT.replace("{{prompt}}", prompt).replace(
    "{{responses}}",
    formatted + requirement
  );
}
