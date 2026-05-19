-- ─── Synthesis Detailed/Clean toggle ─────────────────────────────────────────
-- Adds columns to support the two-view toggle on the LettiB Synthesis output:
--   * detailed_content — the existing attributed/sectioned synthesis (mirrors
--     `content` for backward compatibility).
--   * clean_content    — a second-pass reformat into flowing prose, with
--     attribution tags, "Areas of Agreement / Disagreement", "Key Points",
--     and consensus markers stripped out.
--
-- The clean pass calls the same provider/model as the detailed pass, so we
-- also track its tokens / cost / latency separately so the cost breakdown
-- card can show "Synthesis (detailed): $Y · Synthesis (clean): $Z · Total".
--
-- Safe to re-run: every column uses IF NOT EXISTS.
-- Applies to BOTH `public.syntheses` (read by the synthesis page + share
-- page) and `public.synthesis_answers` (kept in parity per migration 022).

-- ── syntheses ────────────────────────────────────────────────────────────────
alter table public.syntheses
  add column if not exists detailed_content text;

alter table public.syntheses
  add column if not exists clean_content text;

alter table public.syntheses
  add column if not exists clean_provider text;

alter table public.syntheses
  add column if not exists clean_model text;

alter table public.syntheses
  add column if not exists clean_tokens_in integer default 0 not null;

alter table public.syntheses
  add column if not exists clean_tokens_out integer default 0 not null;

alter table public.syntheses
  add column if not exists clean_cost_usd numeric(12, 6) default 0 not null;

alter table public.syntheses
  add column if not exists clean_latency_ms integer default 0 not null;

-- Backfill detailed_content from the legacy `content` column so existing
-- rows still render Detailed when the page reads detailed_content directly.
update public.syntheses
set detailed_content = content
where detailed_content is null;

-- ── synthesis_answers (Session 9 compare → synthesis mirror) ─────────────────
alter table public.synthesis_answers
  add column if not exists detailed_content text;

alter table public.synthesis_answers
  add column if not exists clean_content text;

alter table public.synthesis_answers
  add column if not exists clean_provider text;

alter table public.synthesis_answers
  add column if not exists clean_model text;

alter table public.synthesis_answers
  add column if not exists clean_tokens_in integer default 0 not null;

alter table public.synthesis_answers
  add column if not exists clean_tokens_out integer default 0 not null;

alter table public.synthesis_answers
  add column if not exists clean_cost_usd numeric(12, 6) default 0 not null;

alter table public.synthesis_answers
  add column if not exists clean_latency_ms integer default 0 not null;

update public.synthesis_answers
set detailed_content = content
where detailed_content is null;
