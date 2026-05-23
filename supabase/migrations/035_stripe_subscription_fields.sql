-- Session 20: Stripe subscription lifecycle fields on profiles.

alter table public.profiles
  add column if not exists subscription_status text not null default 'active';

alter table public.profiles
  add column if not exists current_period_end timestamptz;

comment on column public.profiles.subscription_status is
  'Stripe subscription status: active, canceled, past_due, etc.';

comment on column public.profiles.current_period_end is
  'End of current Stripe billing period (UTC).';
