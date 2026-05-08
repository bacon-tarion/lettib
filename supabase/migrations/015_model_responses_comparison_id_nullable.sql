-- ─── model_responses: relax legacy comparison_id NOT NULL ───────────────────
-- The compare save route now links rows via `conversation_id` (added in
-- migration 008). The legacy `comparison_id` column predates that switch and
-- is no longer populated, so its NOT NULL constraint blocks every insert.

alter table public.model_responses
  alter column comparison_id drop not null;
