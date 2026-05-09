-- ─── project_files: per-project document attachments ───────────────────────
-- Files live in Supabase Storage bucket `lettib-files` at path
--   {user_id}/{project_id}/{uuid}-{original_name}
-- with metadata + extracted text mirrored here for fast retrieval and
-- automatic injection into chat / compare context.

create table if not exists public.project_files (
  id              uuid        default gen_random_uuid() primary key,
  project_id      uuid        references public.projects(id) on delete cascade not null,
  user_id         uuid        references auth.users(id)      on delete cascade not null,
  file_name       text        not null,
  file_size       int         not null,
  file_type       text        not null,
  storage_path    text        not null,
  extracted_text  text,
  created_at      timestamptz default now() not null
);

create index if not exists project_files_project_idx on public.project_files (project_id);
create index if not exists project_files_user_idx    on public.project_files (user_id);

alter table public.project_files enable row level security;

drop policy if exists "owner_all" on public.project_files;
create policy "owner_all" on public.project_files
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Storage bucket policy is managed in the Supabase Storage UI / SQL Editor:
-- see migration notes — the bucket itself must be created out-of-band:
--
--   insert into storage.buckets (id, name, public)
--   values ('lettib-files', 'lettib-files', false)
--   on conflict (id) do nothing;
--
--   create policy "users_own_files" on storage.objects
--     for all
--     using  (bucket_id = 'lettib-files' and (storage.foldername(name))[1] = auth.uid()::text)
--     with check (bucket_id = 'lettib-files' and (storage.foldername(name))[1] = auth.uid()::text);
