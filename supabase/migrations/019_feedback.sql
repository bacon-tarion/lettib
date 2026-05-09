-- ─── User-submitted product feedback ───────────────────────────────────────
create table if not exists public.feedback (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references auth.users(id) on delete cascade not null,
  category    text        not null,
  message     text        not null,
  page        text,
  resolved    boolean     default false not null,
  resolved_at timestamptz,
  created_at  timestamptz default now() not null
);

create index if not exists feedback_user_idx     on public.feedback (user_id);
create index if not exists feedback_created_idx  on public.feedback (created_at desc);

alter table public.feedback enable row level security;

drop policy if exists feedback_insert_own on public.feedback;
create policy feedback_insert_own on public.feedback
  for insert with check (auth.uid() = user_id);

drop policy if exists feedback_select_own on public.feedback;
create policy feedback_select_own on public.feedback
  for select using (auth.uid() = user_id);

grant select, insert, update on public.feedback to service_role;
