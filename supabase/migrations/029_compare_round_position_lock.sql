-- Lock compare follow-up / "Ask this model" round allocation so concurrent
-- POST /api/compare requests cannot pick the same position range.

create or replace function public.compare_alloc_next_round(
  p_conversation_id uuid,
  p_lane_count int
) returns table (
  round_index int,
  start_position int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start int;
  v_round int;
begin
  if p_lane_count < 1 then
    raise exception 'p_lane_count must be >= 1';
  end if;

  -- Serialize all allocators for this conversation for the duration of the
  -- transaction (the API route wraps each request in an implicit tx when
  -- using Supabase — inserts after this see the updated MAX).
  perform pg_advisory_xact_lock(hashtext(p_conversation_id::text));

  select coalesce(max(mr.position), -1) + 1 into v_start
  from public.model_responses mr
  where mr.conversation_id = p_conversation_id;

  select coalesce(max(mr.round_index), -1) + 1 into v_round
  from public.model_responses mr
  where mr.conversation_id = p_conversation_id;

  return query select v_round, v_start;
end;
$$;

comment on function public.compare_alloc_next_round(uuid, int) is
  'Returns the next round_index and first free position for a new compare round. Callers must insert exactly p_lane_count consecutive rows at start_position..start_position+p_lane_count-1. Uses an advisory xact lock per conversation.';

grant execute on function public.compare_alloc_next_round(uuid, int) to service_role;
