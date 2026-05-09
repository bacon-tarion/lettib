-- ─── Syntheses: add mode column to distinguish API vs manual paste ──────────
-- 'api'    = generated from a Compare session with model_responses rows
-- 'manual' = generated from user-pasted text via /manual-compare (no API keys)

alter table public.syntheses
  add column if not exists mode text default 'api' not null;

create index if not exists syntheses_mode_idx
  on public.syntheses (user_id, mode);
