-- ─── Global search RPC + feedback authenticated insert grant ───────────────
-- Bug 3: app/api/search calls search_user_content — function was never created.
-- Bug 5: feedback RLS allowed authenticated inserts but GRANT was missing.

-- ── search_user_content ─────────────────────────────────────────────────────
create or replace function public.search_user_content(search_query text)
returns table (
  id          uuid,
  type        text,
  title       text,
  snippet     text,
  project_id  uuid,
  project_name text,
  updated_at  timestamptz,
  rank        real
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
  -- Projects
  select
    p.id,
    'project'::text,
    p.name,
    left(coalesce(p.description, ''), 200),
    p.id,
    p.name,
    p.updated_at,
    1.0::real
  from public.projects p
  where p.user_id = uid
    and not p.archived
    and (
      p.name ilike ('%' || q || '%')
      or coalesce(p.description, '') ilike ('%' || q || '%')
    )

  union all

  -- Conversations (chat + compare titles and message bodies)
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
    1.0::real
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

  -- Syntheses (primary read table for the synthesis pages)
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
    1.0::real
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

  -- synthesis_answers mirror (Compare → synthesis rows)
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
    1.0::real
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

  order by rank desc nulls last, updated_at desc
  limit 50;
end;
$$;

grant execute on function public.search_user_content(text) to authenticated;
grant execute on function public.search_user_content(text) to service_role;

-- ── feedback: authenticated users need INSERT (RLS already scopes to owner) ───
grant insert on public.feedback to authenticated;
