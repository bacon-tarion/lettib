-- Projects table
create table if not exists public.projects (
  id              uuid        default gen_random_uuid() primary key,
  user_id         uuid        references auth.users(id) on delete cascade not null,
  name            text        not null,
  description     text,
  pinned          boolean     default false not null,
  archived        boolean     default false not null,
  memory_enabled  boolean     default true  not null,
  default_ai_team text        default 'solo' not null,
  created_at      timestamptz default now() not null,
  updated_at      timestamptz default now() not null
);

-- Row-level security: users can only see and manage their own projects
alter table public.projects enable row level security;

create policy "owner_all" on public.projects
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Auto-update updated_at on every row change
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_updated_at
  before update on public.projects
  for each row execute procedure public.touch_updated_at();

-- Indexes for common query patterns
create index if not exists projects_user_id_idx    on public.projects (user_id);
create index if not exists projects_pinned_idx     on public.projects (user_id, pinned)   where pinned = true;
create index if not exists projects_archived_idx   on public.projects (user_id, archived) where archived = false;
