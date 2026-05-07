-- ─── Synthesis Rating + Feedback ──────────────────────────────────────────────
-- score: 1-5 (UI maps thumbs down=1, thumbs up=5; future fine-grained UI may
--   use the full range). Nullable so "unrated" is distinguishable from 0.
-- user_feedback: optional free-form text submitted alongside the rating.

alter table public.syntheses
  add column if not exists score int;

alter table public.syntheses
  add column if not exists user_feedback text;

alter table public.syntheses
  drop constraint if exists syntheses_score_range_check;

alter table public.syntheses
  add constraint syntheses_score_range_check
  check (score is null or (score between 1 and 5));

create index if not exists syntheses_rated_idx
  on public.syntheses (user_id)
  where score is not null;
