-- Free-tier synthesis quota counter (reset handled via billing_cycle_resets_at elsewhere).

alter table public.profiles
  add column if not exists messages_used_this_month integer not null default 0;

alter table public.profiles
  add column if not exists billing_cycle_resets_at timestamptz;

comment on column public.profiles.messages_used_this_month is
  'Free tier: synthesis count in the current billing cycle.';

comment on column public.profiles.billing_cycle_resets_at is
  'UTC timestamp when messages_used_this_month resets to 0.';
