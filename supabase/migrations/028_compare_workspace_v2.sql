-- Session 11: Compare Workspace v2.
--
-- Compare sessions can now grow in two distinct ways:
--   1. A main follow-up to a subset of models that have "Continue with this
--      model" turned on. This appends a new round with multiple responses.
--   2. An "Ask this model" branch directed at a single model. The branch
--      sees ONLY that model's own prior history — no peer answers — so it
--      can later be cleanly synthesized.
--
-- To let the UI (and any backend re-renders) distinguish these on reload,
-- each model_responses row records the kind of round it belongs to.
--
-- Both kinds remain inside the same `conversations` row (mode='compare') —
-- we do NOT spawn a new conversation per branch. This keeps Synthesis,
-- usage logging, and ownership scoping unchanged.
--
-- Idempotent — safe to re-run.

alter table public.model_responses
  add column if not exists round_kind text not null default 'main';

-- Enforce the small enum without UNION types — easier to drop / add later.
alter table public.model_responses
  drop constraint if exists model_responses_round_kind_check;

alter table public.model_responses
  add constraint model_responses_round_kind_check
  check (round_kind in ('main', 'branch'));

comment on column public.model_responses.round_kind is
  'main = part of a multi-model Compare round (initial or main follow-up). branch = part of an isolated "Ask this model" thread that only sees that single model''s prior outputs. Used by Compare Workspace v2 to label rounds on reload.';

-- Existing rows are correctly 'main' via the column default; nothing to
-- backfill. The (conversation_id, round_index, position) index from
-- migration 025 already covers the read paths used by the dashboard,
-- conversation reload, and Synthesis selection.
