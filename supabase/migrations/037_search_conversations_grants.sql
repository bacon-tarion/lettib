-- Bug fix: search_user_content (security invoker) needs table-level SELECT
-- grants for authenticated users. RLS policies scope rows to auth.uid().

grant select on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant select on public.syntheses to authenticated;

-- Ensure service_role retains full access for server-side routes.
grant select, insert, update, delete on public.conversations to service_role;
grant select, insert, update, delete on public.messages to service_role;
grant select, insert, update, delete on public.syntheses to service_role;
