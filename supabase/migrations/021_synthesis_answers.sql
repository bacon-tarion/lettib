-- ─── synthesis_answers: Session 9 compare → synthesis rows (mirrors key syntheses fields) ─
create table if not exists public.synthesis_answers (
  id                   uuid          default gen_random_uuid() primary key,
  user_id              uuid          references auth.users(id) on delete cascade not null,
  comparison_id        uuid          references public.conversations(id) on delete set null,
  project_id           uuid          references public.projects(id) on delete set null,
  prompt               text          not null,
  content              text          not null,
  tone                 text          default 'professional' not null,
  provider             text          not null,
  model                text          not null,
  tokens_in            int           default 0 not null,
  tokens_out           int           default 0 not null,
  cost_usd             numeric(12,6) default 0 not null,
  latency_ms           int           default 0 not null,
  source_response_ids  uuid[]        default '{}'::uuid[] not null,
  lineage_data         jsonb         default '[]'::jsonb not null,
  conflict_resolutions jsonb         default '[]'::jsonb not null,
  created_at           timestamptz   default now() not null
);

create index if not exists synthesis_answers_user_idx
  on public.synthesis_answers (user_id);
create index if not exists synthesis_answers_comparison_idx
  on public.synthesis_answers (comparison_id);
create index if not exists synthesis_answers_project_idx
  on public.synthesis_answers (project_id);

alter table public.synthesis_answers enable row level security;

drop policy if exists "synthesis_answers_owner_all" on public.synthesis_answers;
create policy "synthesis_answers_owner_all" on public.synthesis_answers
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.synthesis_answers to service_role;
grant select, insert, update on public.synthesis_answers to authenticated;
