-- Ensure DELETE on projects works for app users and service role (idempotent).
grant delete on public.projects to authenticated;
grant delete on public.projects to service_role;
