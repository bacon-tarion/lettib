-- Audit migration (Opus 4.7): performance indexes + RLS hardening.
-- Safe to re-run: every statement is idempotent.
-- See the audit summary on the corresponding commit for full rationale.

-- ─── usage_logs: hot path for /api/usage/* and free-tier quota checks ─────
-- /api/usage/compare-count and /api/synthesis filter by (user_id, action,
-- created_at >= month_start). Without this composite index Postgres has to
-- seq-scan or rely on the implicit FK index on user_id alone, which gets
-- expensive as the table grows.
create index if not exists usage_logs_user_action_created_idx
  on public.usage_logs (user_id, action, created_at desc);

create index if not exists usage_logs_user_created_idx
  on public.usage_logs (user_id, created_at desc);

-- ─── messages: bulk-read per conversation in chronological order ─────────
-- /api/conversations/[id] and lib/conversations/queries always order by
-- (conversation_id, created_at). A single-column FK index on conversation_id
-- forces a sort step.
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

-- ─── conversations: dashboards / recent-activity / project lists ─────────
-- All three list endpoints filter by (user_id, deleted_at is null) ordered
-- by updated_at desc, optionally filtered by mode or project.
create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc)
  where deleted_at is null;

create index if not exists conversations_project_updated_idx
  on public.conversations (project_id, updated_at desc)
  where deleted_at is null and project_id is not null;

-- ─── syntheses: dashboard "Recent Activity" + project tab ────────────────
create index if not exists syntheses_user_created_idx
  on public.syntheses (user_id, created_at desc);

create index if not exists syntheses_project_created_idx
  on public.syntheses (project_id, created_at desc)
  where project_id is not null;

-- Public share lookup is a hot read on /share/[token]; this avoids a full
-- scan when the share endpoint resolves a token to a synthesis row.
create index if not exists syntheses_share_token_idx
  on public.syntheses (share_token)
  where is_public = true and share_token is not null;

-- ─── model_responses: a fallback composite for the (conv_id, position) read
-- path used by /api/conversations/[id] when round_index is not in play.
create index if not exists model_responses_conversation_position_idx
  on public.model_responses (conversation_id, position);

-- ─── feedback: admin queue ordered by recency ────────────────────────────
create index if not exists feedback_resolved_created_idx
  on public.feedback (resolved, created_at desc);

-- ─── RLS sanity: explicit, idempotent re-application of existing policies
-- in case migrations were partially applied. We do NOT widen any policy.

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.usage_logs enable row level security;

-- conversations: owner-only read/write
drop policy if exists conversations_owner_all on public.conversations;
create policy conversations_owner_all on public.conversations
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- messages: owned via parent conversation
drop policy if exists messages_owner_via_conversation on public.messages;
create policy messages_owner_via_conversation on public.messages
  for all
  using (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = auth.uid()
  ));

-- usage_logs: read-own, writes go via service role (we never accept
-- user-supplied cost/token values without bounds — see /api/chat/save).
drop policy if exists usage_logs_select_own on public.usage_logs;
create policy usage_logs_select_own on public.usage_logs
  for select using (auth.uid() = user_id);

grant select on public.usage_logs to authenticated;
grant select, insert on public.usage_logs to service_role;
grant select, insert, update, delete on public.messages to service_role;
grant select, insert, update, delete on public.conversations to service_role;
