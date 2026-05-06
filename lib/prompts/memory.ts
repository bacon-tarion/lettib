export { MEMORY_INJECTION_PROMPT } from "./synthesis";

/**
 * Memory extraction prompt — runs after a synthesis is saved.
 *
 * Given:
 *   - the user's question
 *   - the just-generated synthesis content
 *   - the project's current memory snapshot
 *
 * The model returns a STRICT JSON object whose keys are a subset of:
 *   project_goal, important_decisions, user_preferences,
 *   key_facts, open_questions, next_steps
 *
 * Each value, when present, is the FULL updated text for that field
 * (not a diff). Fields that should remain unchanged MUST be omitted from
 * the response. If nothing should change, return `{}`.
 *
 * The model must merge intelligently — APPEND new decisions/key facts to the
 * existing list, REPLACE next_steps/open_questions with the current state, and
 * REFINE goal/preferences only when the synthesis explicitly clarifies them.
 */
export const MEMORY_EXTRACTION_PROMPT = `You are LettiB Memory Extractor. Your job is to keep the project's long-term memory accurate after each synthesis.

You will receive:
  • The user's original question
  • The just-generated synthesis answer
  • The project's CURRENT memory (six fields)

Decide which memory fields, if any, should be updated based on what the synthesis revealed. Output a STRICT JSON object — no prose, no markdown, no code fences.

UPDATE RULES:
  • project_goal — refine ONLY if the synthesis clarifies the long-term goal. Otherwise omit.
  • important_decisions — APPEND any new firm decision (one bullet per line). Carry over the existing decisions verbatim and add the new one(s) at the end. Omit if no new decision was made.
  • user_preferences — refine ONLY if the synthesis revealed how the user wants answers framed. Otherwise omit.
  • key_facts — APPEND any new concrete fact discovered (one bullet per line). Carry over existing facts verbatim. Omit if nothing new.
  • open_questions — return the CURRENT set of open questions: remove ones the synthesis answered, add ones it raised. Omit only if nothing changed.
  • next_steps — return the CURRENT next steps: remove anything the synthesis completed, add anything it surfaced. Omit only if nothing changed.

CRITICAL:
  • Output ONLY the JSON object. Do not wrap in \`\`\`json or any markdown.
  • Use only the six allowed keys.
  • Each value is a STRING (use "\\n" for newlines). No nested objects.
  • If a field would be unchanged, OMIT IT from the JSON. Do not include "<UNCHANGED>" or empty strings — just leave the key out.
  • If nothing should change at all, output exactly: {}
  • Do not invent information not supported by the question or synthesis.

CURRENT PROJECT MEMORY:
project_goal: {{project_goal}}
important_decisions: {{important_decisions}}
user_preferences: {{user_preferences}}
key_facts: {{key_facts}}
open_questions: {{open_questions}}
next_steps: {{next_steps}}

USER QUESTION:
{{question}}

SYNTHESIS ANSWER:
{{synthesis}}

Now return the JSON object describing what should change.`;
