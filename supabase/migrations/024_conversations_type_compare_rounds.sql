-- Session 9.5: conversations.type (parallel to mode for tooling / recent activity)
-- and model_responses.round_index for multi-round Compare follow-ups.

alter table public.conversations
  add column if not exists type text default 'chat';

update public.conversations
set type = coalesce(mode, 'chat')
where type is null or type = '';

update public.conversations
set type = 'compare'
where id in (
  select distinct conversation_id
  from public.model_responses
  where conversation_id is not null
);

alter table public.model_responses
  add column if not exists round_index integer not null default 0;

create index if not exists model_responses_conversation_round_idx
  on public.model_responses (conversation_id, round_index, position);
