-- Session 11: Fix search_user_content ORDER BY (wrap UNION in subquery).
-- Session 12: Unified project memory content field.

alter table public.project_memory
  add column if not exists content text;

-- Backfill content from structured fields when empty
update public.project_memory pm
set content = trim(both from concat_ws(
  E'\n\n',
  nullif(trim(pm.project_goal), ''),
  nullif(trim(pm.important_decisions), ''),
  nullif(trim(pm.user_preferences), ''),
  nullif(trim(pm.key_facts), ''),
  nullif(trim(pm.open_questions), ''),
  nullif(trim(pm.next_steps), '')
))
where coalesce(trim(pm.content), '') = ''
  and (
    coalesce(trim(pm.project_goal), '') <> ''
    or coalesce(trim(pm.important_decisions), '') <> ''
    or coalesce(trim(pm.user_preferences), '') <> ''
    or coalesce(trim(pm.key_facts), '') <> ''
    or coalesce(trim(pm.open_questions), '') <> ''
    or coalesce(trim(pm.next_steps), '') <> ''
  );

create or replace function public.search_user_content(search_query text)
returns table (
  id           uuid,
  type         text,
  title        text,
  snippet      text,
  project_id   uuid,
  project_name text,
  updated_at   timestamptz,
  rank         real,
  mode         text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  q   text := trim(search_query);
begin
  if uid is null or q = '' then
    return;
  end if;

  return query
  select *
  from (
    -- Projects
    select
      p.id,
      'project'::text as type,
      p.name as title,
      left(coalesce(p.description, ''), 200) as snippet,
      p.id as project_id,
      p.name as project_name,
      p.updated_at,
      case
        when p.name ilike (q || '%') then 3.0
        when p.name ilike ('%' || q || '%') then 2.0
        else 1.0
      end::real as rank,
      null::text as mode
    from public.projects p
    where p.user_id = uid
      and not p.archived
      and (
        p.name ilike ('%' || q || '%')
        or coalesce(p.description, '') ilike ('%' || q || '%')
      )

    union all

    -- Conversations
    select
      c.id,
      'conversation'::text,
      coalesce(nullif(trim(c.title), ''), 'Untitled conversation'),
      left(coalesce(
        (
          select m.content
          from public.messages m
          where m.conversation_id = c.id
          order by m.created_at desc
          limit 1
        ),
        ''
      ), 200),
      c.project_id,
      pr.name,
      c.updated_at,
      case
        when coalesce(c.title, '') ilike (q || '%') then 3.0
        when coalesce(c.title, '') ilike ('%' || q || '%') then 2.0
        else 1.0
      end::real,
      c.mode
    from public.conversations c
    left join public.projects pr on pr.id = c.project_id
    where c.user_id = uid
      and c.deleted_at is null
      and (
        coalesce(c.title, '') ilike ('%' || q || '%')
        or exists (
          select 1
          from public.messages m
          where m.conversation_id = c.id
            and m.content ilike ('%' || q || '%')
        )
      )

    union all

    -- Syntheses
    select
      s.id,
      'synthesis'::text,
      left(coalesce(nullif(trim(s.prompt), ''), 'Synthesis'), 120),
      left(
        coalesce(
          nullif(trim(s.detailed_content), ''),
          nullif(trim(s.content), ''),
          nullif(trim(s.clean_content), ''),
          ''
        ),
        200
      ),
      s.project_id,
      pr.name,
      s.created_at,
      case
        when coalesce(s.prompt, '') ilike ('%' || q || '%') then 2.5
        else 1.0
      end::real,
      null::text
    from public.syntheses s
    left join public.projects pr on pr.id = s.project_id
    where s.user_id = uid
      and (
        coalesce(s.prompt, '') ilike ('%' || q || '%')
        or coalesce(s.content, '') ilike ('%' || q || '%')
        or coalesce(s.detailed_content, '') ilike ('%' || q || '%')
        or coalesce(s.clean_content, '') ilike ('%' || q || '%')
      )

    union all

    -- synthesis_answers mirror
    select
      sa.id,
      'synthesis'::text,
      left(coalesce(nullif(trim(sa.prompt), ''), 'Synthesis'), 120),
      left(
        coalesce(
          nullif(trim(sa.detailed_content), ''),
          nullif(trim(sa.content), ''),
          nullif(trim(sa.clean_content), ''),
          ''
        ),
        200
      ),
      sa.project_id,
      pr.name,
      sa.created_at,
      case
        when coalesce(sa.prompt, '') ilike ('%' || q || '%') then 2.5
        else 1.0
      end::real,
      null::text
    from public.synthesis_answers sa
    left join public.projects pr on pr.id = sa.project_id
    where sa.user_id = uid
      and (
        coalesce(sa.prompt, '') ilike ('%' || q || '%')
        or coalesce(sa.content, '') ilike ('%' || q || '%')
        or coalesce(sa.detailed_content, '') ilike ('%' || q || '%')
        or coalesce(sa.clean_content, '') ilike ('%' || q || '%')
      )
      and not exists (
        select 1 from public.syntheses sx where sx.id = sa.id
      )
  ) combined
  order by combined.rank desc nulls last, combined.updated_at desc
  limit 50;
end;
$$;

grant execute on function public.search_user_content(text) to authenticated;
grant execute on function public.search_user_content(text) to service_role;
