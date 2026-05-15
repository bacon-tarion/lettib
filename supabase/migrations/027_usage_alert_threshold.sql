-- Session 10: per-user usage-alert threshold + last-alerted bookmark on profiles.
-- The dashboard subscribes to usage_logs via Realtime and, on each new row,
-- recomputes the rolling 30-day total. If it has crossed the next multiple of
-- `usage_alert_threshold_cents` above `last_alerted_total_cents`, the server
-- (via /api/usage/threshold) updates the bookmark and the UI fires a toast.
--
-- Storing this on `profiles` keeps everything per-user and lets RLS scope it
-- to the owner without a new table. Defaults to $10 (1000 cents).
--
-- Idempotent — safe to re-run.

alter table public.profiles
  add column if not exists usage_alert_threshold_cents integer not null default 1000;

alter table public.profiles
  add column if not exists last_alerted_total_cents integer not null default 0;

-- Guardrails on the threshold value. Anything <= 0 would either alert
-- continuously or never; anything > $10,000 / alert is almost certainly a
-- typo. We allow 100 cents ($1) up to 1,000,000 cents ($10,000).
alter table public.profiles
  drop constraint if exists profiles_usage_alert_threshold_check;

alter table public.profiles
  add constraint profiles_usage_alert_threshold_check
  check (
    usage_alert_threshold_cents between 100 and 1000000
    and last_alerted_total_cents >= 0
  );

comment on column public.profiles.usage_alert_threshold_cents is
  'User-configurable spend alert step in cents (default $10). When rolling 30-day spend crosses the next multiple above last_alerted_total_cents, the dashboard fires a toast.';
comment on column public.profiles.last_alerted_total_cents is
  'Highest multiple of usage_alert_threshold_cents we have already alerted on. Server-managed via /api/usage/threshold — clients never set this directly.';

-- ─── RLS: user can read & update their own row only ──────────────────────
-- profiles already has RLS enabled via earlier migrations, but we
-- re-assert the relevant policies idempotently here so this migration is
-- self-contained.

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ─── GRANTS ──────────────────────────────────────────────────────────────
-- service_role requires explicit GRANTs even though it bypasses RLS — this
-- has bitten us before (see migration 006 / audit notes). The threshold-
-- update API route uses the service client to atomically set
-- last_alerted_total_cents (never trust a client-supplied bookmark).

grant select, update on public.profiles to authenticated;
grant select, insert, update on public.profiles to service_role;

-- ─── Realtime: publish usage_logs INSERTs for the live dashboard ─────────
-- The dashboard's live spend counter subscribes to postgres_changes on
-- usage_logs filtered by user_id. That requires the table to be part of
-- the `supabase_realtime` publication. Wrapped in DO so re-running this
-- migration on a DB that already publishes the table doesn't error.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'usage_logs'
  ) then
    alter publication supabase_realtime add table public.usage_logs;
  end if;
end
$$;
