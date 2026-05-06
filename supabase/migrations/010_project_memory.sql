-- ─── Project Memory: ensure table exists with full schema + RLS ──────────────
-- Idempotent: safe to re-run. Some columns may already exist if the table
-- was created ad-hoc earlier; `if not exists` handles that.

create table if not exists public.project_memory (
  project_id   uuid primary key references public.projects(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  project_goal         text,
  important_decisions  text,
  user_preferences     text,
  key_facts            text,
  open_questions       text,
  next_steps           text,
  updated_at   timestamptz not null default now()
);

-- Backfill columns if the table existed without them
alter table public.project_memory add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.project_memory add column if not exists project_goal        text;
alter table public.project_memory add column if not exists important_decisions text;
alter table public.project_memory add column if not exists user_preferences    text;
alter table public.project_memory add column if not exists key_facts           text;
alter table public.project_memory add column if not exists open_questions      text;
alter table public.project_memory add column if not exists next_steps          text;
alter table public.project_memory add column if not exists updated_at          timestamptz not null default now();

-- Auto-bump updated_at on writes
create or replace function public.tg_project_memory_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists project_memory_set_updated_at on public.project_memory;
create trigger project_memory_set_updated_at
  before update on public.project_memory
  for each row execute function public.tg_project_memory_set_updated_at();

-- RLS — all writes go through service-role client, but RLS still gates anything
-- that does sneak through under the user role.
alter table public.project_memory enable row level security;

drop policy if exists project_memory_select_own on public.project_memory;
create policy project_memory_select_own on public.project_memory
  for select using (auth.uid() = user_id);

drop policy if exists project_memory_insert_own on public.project_memory;
create policy project_memory_insert_own on public.project_memory
  for insert with check (auth.uid() = user_id);

drop policy if exists project_memory_update_own on public.project_memory;
create policy project_memory_update_own on public.project_memory
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists project_memory_delete_own on public.project_memory;
create policy project_memory_delete_own on public.project_memory
  for delete using (auth.uid() = user_id);

-- service_role bypasses RLS via grants
grant select, insert, update, delete on public.project_memory to service_role;
