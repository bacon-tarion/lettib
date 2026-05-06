-- ─── Conversations: soft-delete column + indexes ─────────────────────────────
alter table public.conversations
  add column if not exists deleted_at timestamptz;

-- Hot path: list user's non-deleted conversations, optionally filtered by project
create index if not exists conversations_user_active_idx
  on public.conversations (user_id, project_id, updated_at desc)
  where deleted_at is null;

-- Optional: drop+recreate the existing mode index to also exclude deleted rows
drop index if exists conversations_mode_idx;
create index if not exists conversations_user_mode_active_idx
  on public.conversations (user_id, mode, updated_at desc)
  where deleted_at is null;

-- Counts query helper: messages per conversation
create index if not exists messages_conversation_idx
  on public.messages (conversation_id);
