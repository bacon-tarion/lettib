-- Migration 036: Projects redesign — notes, project metadata, sort order

-- Custom instructions and appearance on projects
alter table public.projects
  add column if not exists custom_instructions text,
  add column if not exists icon text,
  add column if not exists color text,
  add column if not exists sort_order integer default 0 not null;

-- Project notes (one row per project, upserted by project_id)
create table if not exists public.project_notes (
  id          uuid        default gen_random_uuid() primary key,
  project_id  uuid        references public.projects(id) on delete cascade not null unique,
  user_id     uuid        references auth.users(id) on delete cascade not null,
  content     text        default '' not null,
  updated_at  timestamptz default now() not null,
  created_at  timestamptz default now() not null
);

create index if not exists project_notes_project_idx on public.project_notes (project_id);
create index if not exists project_notes_user_idx    on public.project_notes (user_id);

alter table public.project_notes enable row level security;

drop policy if exists "owner_all" on public.project_notes;
create policy "owner_all" on public.project_notes
  for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Auto-update updated_at on notes
drop trigger if exists project_notes_updated_at on public.project_notes;
create trigger project_notes_updated_at
  before update on public.project_notes
  for each row execute procedure public.touch_updated_at();

grant select, insert, update, delete on public.project_notes to service_role;
grant select, insert, update, delete on public.project_notes to authenticated;
