-- Catch-up: ai_teams + ai_team_members (live DB already has these; safe on fresh installs).

create table if not exists public.ai_teams (
  id                uuid        default gen_random_uuid() primary key,
  user_id           uuid        references auth.users(id) on delete cascade not null,
  name              text        not null,
  default_tone      text        default 'professional' not null,
  primary_provider  text        not null,
  primary_model     text        not null,
  created_at        timestamptz default now() not null,
  deleted_at        timestamptz
);

create index if not exists ai_teams_user_id_idx
  on public.ai_teams (user_id);

create index if not exists ai_teams_user_active_idx
  on public.ai_teams (user_id)
  where deleted_at is null;

create table if not exists public.ai_team_members (
  id          uuid        default gen_random_uuid() primary key,
  ai_team_id  uuid        references public.ai_teams(id) on delete cascade not null,
  provider    text        not null,
  model       text        not null,
  position    int         default 0 not null
);

create index if not exists ai_team_members_team_idx
  on public.ai_team_members (ai_team_id);

alter table public.ai_teams enable row level security;
alter table public.ai_team_members enable row level security;

drop policy if exists ai_teams_select_own on public.ai_teams;
create policy ai_teams_select_own on public.ai_teams
  for select to authenticated
  using (auth.uid() = user_id and deleted_at is null);

drop policy if exists ai_teams_insert_own on public.ai_teams;
create policy ai_teams_insert_own on public.ai_teams
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists ai_teams_update_own on public.ai_teams;
create policy ai_teams_update_own on public.ai_teams
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists ai_team_members_select_own on public.ai_team_members;
create policy ai_team_members_select_own on public.ai_team_members
  for select to authenticated
  using (
    exists (
      select 1 from public.ai_teams t
      where t.id = ai_team_id
        and t.user_id = auth.uid()
        and t.deleted_at is null
    )
  );

drop policy if exists ai_team_members_insert_own on public.ai_team_members;
create policy ai_team_members_insert_own on public.ai_team_members
  for insert to authenticated
  with check (
    exists (
      select 1 from public.ai_teams t
      where t.id = ai_team_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists ai_team_members_update_own on public.ai_team_members;
create policy ai_team_members_update_own on public.ai_team_members
  for update to authenticated
  using (
    exists (
      select 1 from public.ai_teams t
      where t.id = ai_team_id and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.ai_teams t
      where t.id = ai_team_id and t.user_id = auth.uid()
    )
  );

drop policy if exists ai_team_members_delete_own on public.ai_team_members;
create policy ai_team_members_delete_own on public.ai_team_members
  for delete to authenticated
  using (
    exists (
      select 1 from public.ai_teams t
      where t.id = ai_team_id and t.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.ai_teams to authenticated;
grant select, insert, update, delete on public.ai_teams to service_role;
grant select, insert, update, delete on public.ai_team_members to authenticated;
grant select, insert, update, delete on public.ai_team_members to service_role;
