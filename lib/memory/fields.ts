export const MEMORY_FIELDS = [
  {
    key: "project_goal",
    label: "Project Goal",
    placeholder: "What outcome are you working toward?",
    rows: 2,
  },
  {
    key: "important_decisions",
    label: "Important Decisions",
    placeholder: "Choices made that should not be revisited unless context changes.",
    rows: 4,
  },
  {
    key: "user_preferences",
    label: "User Preferences",
    placeholder: "How you like answers framed, formatted, and toned.",
    rows: 3,
  },
  {
    key: "key_facts",
    label: "Key Facts",
    placeholder: "Concrete facts the AI should always know about this project.",
    rows: 4,
  },
  {
    key: "open_questions",
    label: "Open Questions",
    placeholder: "Things still unresolved you'd like the AI to keep in mind.",
    rows: 3,
  },
  {
    key: "next_steps",
    label: "Next Steps",
    placeholder: "What's coming up that the AI should help advance.",
    rows: 3,
  },
] as const;

export type MemoryFieldKey = (typeof MEMORY_FIELDS)[number]["key"];

export const MEMORY_FIELD_KEYS: readonly MemoryFieldKey[] = MEMORY_FIELDS.map(
  (f) => f.key
);

export function isMemoryFieldKey(value: string): value is MemoryFieldKey {
  return (MEMORY_FIELD_KEYS as readonly string[]).includes(value);
}

export type MemoryRow = {
  project_id: string;
  user_id: string;
  content: string | null;
  project_goal: string | null;
  important_decisions: string | null;
  user_preferences: string | null;
  key_facts: string | null;
  open_questions: string | null;
  next_steps: string | null;
  updated_at: string;
};
