-- Projects: explicit grants + split RLS policies so logged-in users can insert their own rows.
-- Without GRANT ... TO authenticated, inserts fail with "permission denied" even when policies exist.

grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.projects to service_role;

drop policy if exists "owner_all" on public.projects;

create policy "projects_select_own"
  on public.projects
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "projects_insert_own"
  on public.projects
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "projects_update_own"
  on public.projects
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "projects_delete_own"
  on public.projects
  for delete
  to authenticated
  using (auth.uid() = user_id);
