-- ─── Conversations: add mode column for chat / compare ────────────────────────
alter table public.conversations
  add column if not exists mode text default 'chat' not null;

create index if not exists conversations_mode_idx
  on public.conversations (user_id, mode);

-- ─── model_responses: one row per model in a compare session ──────────────────
create table if not exists public.model_responses (
  id               uuid        default gen_random_uuid() primary key,
  conversation_id  uuid        references public.conversations(id) on delete cascade not null,
  provider         text        not null,
  model            text        not null,
  content          text        default '' not null,
  tokens_in        int         default 0 not null,
  tokens_out       int         default 0 not null,
  cost_usd         numeric(12,6) default 0 not null,
  latency_ms       int         default 0 not null,
  error            text,
  score_accuracy   int,
  score_clarity    int,
  score_creativity int,
  score_usefulness int,
  score_risk       int,
  position         int         default 0 not null,
  created_at       timestamptz default now() not null
);

alter table public.model_responses enable row level security;

drop policy if exists "owner_via_conversation" on public.model_responses;
create policy "owner_via_conversation" on public.model_responses
  for all
  using (exists (
    select 1 from public.conversations c
    where c.id = model_responses.conversation_id
      and c.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.conversations c
    where c.id = model_responses.conversation_id
      and c.user_id = auth.uid()
  ));

grant select, insert, update, delete on public.model_responses to service_role;

create index if not exists model_responses_conversation_idx
  on public.model_responses (conversation_id);

-- ─── syntheses: LettiB Synthesis output ───────────────────────────────────────
create table if not exists public.syntheses (
  id                   uuid          default gen_random_uuid() primary key,
  user_id              uuid          references auth.users(id) on delete cascade not null,
  conversation_id      uuid          references public.conversations(id) on delete cascade,
  project_id           uuid          references public.projects(id)      on delete set null,
  prompt               text          not null,
  content              text          not null,
  provider             text,
  model                text,
  tone                 text          default 'professional' not null,
  tokens_in            int           default 0 not null,
  tokens_out           int           default 0 not null,
  cost_usd             numeric(12,6) default 0 not null,
  latency_ms           int           default 0 not null,
  source_response_ids  uuid[]        default '{}'::uuid[] not null,
  created_at           timestamptz   default now() not null
);

alter table public.syntheses enable row level security;

drop policy if exists "owner_all" on public.syntheses;
create policy "owner_all" on public.syntheses
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.syntheses to service_role;

create index if not exists syntheses_user_idx    on public.syntheses (user_id);
create index if not exists syntheses_project_idx on public.syntheses (project_id);
