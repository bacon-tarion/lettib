-- ─── Synthesis lineage: per-sentence source-model attribution ──────────────
-- Stored as jsonb array of { sentence: string, model: string }
-- where `model` is the slug of the source model (e.g. "claude", "gpt", "gemini",
-- "groq", "grok") that the synthesizer attributes that sentence to via [model]
-- tags in its output.

alter table public.syntheses
  add column if not exists lineage_data jsonb default '[]'::jsonb;
