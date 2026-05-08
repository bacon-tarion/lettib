-- ─── Conversations: ensure model column exists ──────────────────────────────
-- The compare save route writes `model` on insert; this guarantees the column
-- is present even on older databases provisioned before the chat/compare split.

alter table public.conversations
  add column if not exists model text;
