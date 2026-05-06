-- ─── Admin Dashboard Grants ───────────────────────────────────────────────────
-- The admin dashboard reads `profiles` via the service-role client to enumerate
-- users. profiles was created in early migrations without an explicit grant,
-- so service_role currently can't SELECT it. Grant only what's needed.

grant select on public.profiles to service_role;

-- usage_logs / conversations / syntheses already have service_role grants from
-- their respective creation migrations, so no further grants needed.

-- Helpful indexes for admin aggregate queries.
create index if not exists usage_logs_user_idx        on public.usage_logs (user_id);
create index if not exists usage_logs_created_at_idx  on public.usage_logs (created_at desc);
create index if not exists usage_logs_provider_idx    on public.usage_logs (provider);
create index if not exists conversations_user_id_idx  on public.conversations (user_id);
