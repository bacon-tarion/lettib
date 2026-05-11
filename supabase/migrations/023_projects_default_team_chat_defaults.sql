-- Default AI team (FK) and optional single-model defaults for Chat in this project.
alter table public.projects
  add column if not exists default_team_id uuid references public.ai_teams(id) on delete set null;

alter table public.projects
  add column if not exists default_chat_provider text;

alter table public.projects
  add column if not exists default_chat_model text;

create index if not exists projects_default_team_id_idx
  on public.projects (default_team_id);

comment on column public.projects.default_team_id is 'Optional default AI team (multi-model) for this project.';
comment on column public.projects.default_chat_provider is 'Optional default provider for new single-model chats in this project.';
comment on column public.projects.default_chat_model is 'Optional default model id for new single-model chats in this project.';
