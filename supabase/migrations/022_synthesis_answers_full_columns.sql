-- synthesis_answers: one-shot alignment with app + syntheses parity
-- Safe to re-run: every column uses IF NOT EXISTS.
-- App insert (app/api/synthesis/route.ts): id, user_id, comparison_id, project_id,
--   prompt, content, tone, provider, model, tokens_in, tokens_out, cost_usd,
--   latency_ms, source_response_ids, lineage_data, conflict_resolutions
-- Parity with public.syntheses (future reads / sharing / ratings): mode,
--   is_public, share_token, score, user_feedback, conversation_id (same FK as compare)

-- Bootstrap: minimal table so ALTERs always have a target
create table if not exists public.synthesis_answers (
  id uuid primary key default gen_random_uuid()
);

-- Core compare -> synthesis fields
alter table public.synthesis_answers
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.synthesis_answers
  add column if not exists comparison_id uuid references public.conversations(id) on delete set null;

-- Same conversation as comparison_id (mirrors syntheses.conversation_id naming)
alter table public.synthesis_answers
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null;

alter table public.synthesis_answers
  add column if not exists project_id uuid references public.projects(id) on delete set null;

alter table public.synthesis_answers
  add column if not exists prompt text;

alter table public.synthesis_answers
  add column if not exists content text;

alter table public.synthesis_answers
  add column if not exists tone text;

alter table public.synthesis_answers
  add column if not exists provider text;

alter table public.synthesis_answers
  add column if not exists model text;

alter table public.synthesis_answers
  add column if not exists tokens_in integer;

alter table public.synthesis_answers
  add column if not exists tokens_out integer;

alter table public.synthesis_answers
  add column if not exists cost_usd numeric(12, 6);

alter table public.synthesis_answers
  add column if not exists latency_ms integer;

alter table public.synthesis_answers
  add column if not exists source_response_ids uuid[];

alter table public.synthesis_answers
  add column if not exists lineage_data jsonb;

alter table public.synthesis_answers
  add column if not exists conflict_resolutions jsonb;

alter table public.synthesis_answers
  add column if not exists created_at timestamptz;

-- Parity with syntheses (011, 013, 020)
alter table public.synthesis_answers
  add column if not exists mode text;

alter table public.synthesis_answers
  add column if not exists is_public boolean;

alter table public.synthesis_answers
  add column if not exists share_token uuid;

alter table public.synthesis_answers
  add column if not exists score integer;

alter table public.synthesis_answers
  add column if not exists user_feedback text;

-- Defaults + NOT NULL (idempotent for already-populated tables)
alter table public.synthesis_answers alter column prompt set default '';

alter table public.synthesis_answers alter column content set default '';

update public.synthesis_answers set prompt = '' where prompt is null;

update public.synthesis_answers set content = '' where content is null;

alter table public.synthesis_answers alter column prompt set not null;

alter table public.synthesis_answers alter column content set not null;

alter table public.synthesis_answers alter column tone set default 'professional';

update public.synthesis_answers set tone = 'professional' where tone is null;

alter table public.synthesis_answers alter column tone set not null;

alter table public.synthesis_answers alter column provider set default 'anthropic';

update public.synthesis_answers set provider = 'anthropic' where provider is null;

alter table public.synthesis_answers alter column provider set not null;

alter table public.synthesis_answers alter column model set default '';

update public.synthesis_answers set model = '' where model is null;

alter table public.synthesis_answers alter column model set not null;

alter table public.synthesis_answers alter column tokens_in set default 0;

update public.synthesis_answers set tokens_in = 0 where tokens_in is null;

alter table public.synthesis_answers alter column tokens_in set not null;

alter table public.synthesis_answers alter column tokens_out set default 0;

update public.synthesis_answers set tokens_out = 0 where tokens_out is null;

alter table public.synthesis_answers alter column tokens_out set not null;

alter table public.synthesis_answers alter column cost_usd set default 0;

update public.synthesis_answers set cost_usd = 0 where cost_usd is null;

alter table public.synthesis_answers alter column cost_usd set not null;

alter table public.synthesis_answers alter column latency_ms set default 0;

update public.synthesis_answers set latency_ms = 0 where latency_ms is null;

alter table public.synthesis_answers alter column latency_ms set not null;

alter table public.synthesis_answers alter column source_response_ids set default '{}'::uuid[];

update public.synthesis_answers set source_response_ids = '{}'::uuid[] where source_response_ids is null;

alter table public.synthesis_answers alter column source_response_ids set not null;

alter table public.synthesis_answers alter column lineage_data set default '[]'::jsonb;

update public.synthesis_answers set lineage_data = '[]'::jsonb where lineage_data is null;

alter table public.synthesis_answers alter column lineage_data set not null;

alter table public.synthesis_answers alter column conflict_resolutions set default '[]'::jsonb;

update public.synthesis_answers set conflict_resolutions = '[]'::jsonb where conflict_resolutions is null;

alter table public.synthesis_answers alter column conflict_resolutions set not null;

alter table public.synthesis_answers alter column created_at set default now();

update public.synthesis_answers set created_at = now() where created_at is null;

alter table public.synthesis_answers alter column created_at set not null;

alter table public.synthesis_answers alter column mode set default 'api';

update public.synthesis_answers set mode = 'api' where mode is null;

alter table public.synthesis_answers alter column mode set not null;

alter table public.synthesis_answers alter column is_public set default false;

update public.synthesis_answers set is_public = false where is_public is null;

alter table public.synthesis_answers alter column is_public set not null;

-- Keep conversation_id in sync when only comparison_id is written (app behavior)
create or replace function public.synthesis_answers_sync_conversation_from_comparison()
returns trigger
language plpgsql
as $$
begin
  new.conversation_id := new.comparison_id;
  return new;
end;
$$;

drop trigger if exists synthesis_answers_sync_conversation_trg on public.synthesis_answers;

create trigger synthesis_answers_sync_conversation_trg
before insert or update of comparison_id on public.synthesis_answers
for each row
execute function synthesis_answers_sync_conversation_from_comparison();

-- Backfill conversation_id from comparison_id for existing rows
update public.synthesis_answers
set conversation_id = comparison_id
where comparison_id is not null
  and (conversation_id is distinct from comparison_id);

-- Require user_id only when no nulls remain (avoids failing on stray test rows)
do $$
begin
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'synthesis_answers'
      and c.column_name = 'user_id'
  ) and not exists (
    select 1 from public.synthesis_answers where user_id is null
  ) then
    alter table public.synthesis_answers alter column user_id set not null;
  end if;
end;
$$;

-- user_id must be set for RLS on real rows
alter table public.synthesis_answers enable row level security;

drop policy if exists "synthesis_answers_owner_all" on public.synthesis_answers;

create policy "synthesis_answers_owner_all" on public.synthesis_answers
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.synthesis_answers to service_role;

grant select, insert, update on public.synthesis_answers to authenticated;

create index if not exists synthesis_answers_user_idx
  on public.synthesis_answers (user_id);

create index if not exists synthesis_answers_comparison_idx
  on public.synthesis_answers (comparison_id);

create index if not exists synthesis_answers_conversation_idx
  on public.synthesis_answers (conversation_id);

create index if not exists synthesis_answers_project_idx
  on public.synthesis_answers (project_id);

create unique index if not exists synthesis_answers_share_token_uidx
  on public.synthesis_answers (share_token)
  where share_token is not null;

create index if not exists synthesis_answers_is_public_idx
  on public.synthesis_answers (is_public)
  where is_public = true;

alter table public.synthesis_answers
  drop constraint if exists synthesis_answers_score_range_check;

alter table public.synthesis_answers
  add constraint synthesis_answers_score_range_check
  check (score is null or (score between 1 and 5));
