-- Session 15: Compare versioning — snapshots + session pin/title on conversations.

alter table public.conversations
  add column if not exists pinned boolean not null default false;

create index if not exists conversations_compare_pinned_idx
  on public.conversations (user_id, pinned, updated_at desc)
  where mode = 'compare' and deleted_at is null;

create table if not exists public.compare_snapshots (
  id              uuid primary key default gen_random_uuid(),
  comparison_id   uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  round_number    integer not null,
  snapshot_data   jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists compare_snapshots_comparison_idx
  on public.compare_snapshots (comparison_id, round_number);

alter table public.compare_snapshots enable row level security;

drop policy if exists compare_snapshots_select_own on public.compare_snapshots;
create policy compare_snapshots_select_own on public.compare_snapshots
  for select using (auth.uid() = user_id);

drop policy if exists compare_snapshots_insert_own on public.compare_snapshots;
create policy compare_snapshots_insert_own on public.compare_snapshots
  for insert with check (auth.uid() = user_id);

grant select, insert on public.compare_snapshots to authenticated;
grant select, insert, delete on public.compare_snapshots to service_role;
