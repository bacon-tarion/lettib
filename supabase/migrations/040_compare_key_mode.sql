-- ─── Compare key mode: Manual (server Groq) vs BYOK (user vault) ───────────
-- manual = synthesis uses GROQ_API_KEY (no user API key required).
-- byok   = synthesis uses the user's stored key via lettib_read_secret.
--
-- Idempotent — safe to re-run.

alter table public.conversations
  add column if not exists compare_key_mode text default 'byok';

alter table public.conversations
  drop constraint if exists conversations_compare_key_mode_check;

alter table public.conversations
  add constraint conversations_compare_key_mode_check
  check (compare_key_mode in ('manual', 'byok'));

update public.conversations
set compare_key_mode = 'byok'
where compare_key_mode is null;

alter table public.conversations
  alter column compare_key_mode set default 'byok';

alter table public.conversations
  alter column compare_key_mode set not null;

comment on column public.conversations.compare_key_mode is
  'manual = Manual Compare / server GROQ_API_KEY for synthesis; byok = BYOK Compare with user Vault API keys.';

create index if not exists conversations_compare_key_mode_idx
  on public.conversations (compare_key_mode);

alter table public.synthesis_answers
  add column if not exists compare_key_mode text default 'byok';

alter table public.synthesis_answers
  drop constraint if exists synthesis_answers_compare_key_mode_check;

alter table public.synthesis_answers
  add constraint synthesis_answers_compare_key_mode_check
  check (compare_key_mode in ('manual', 'byok'));

update public.synthesis_answers
set compare_key_mode = 'byok'
where compare_key_mode is null;

alter table public.synthesis_answers
  alter column compare_key_mode set default 'byok';

alter table public.synthesis_answers
  alter column compare_key_mode set not null;

comment on column public.synthesis_answers.compare_key_mode is
  'manual = server GROQ_API_KEY for synthesis; byok = user Vault API key (mirrors conversations.compare_key_mode).';

create index if not exists synthesis_answers_compare_key_mode_idx
  on public.synthesis_answers (compare_key_mode);
