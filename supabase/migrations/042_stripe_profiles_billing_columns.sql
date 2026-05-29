-- Stripe billing columns on profiles (idempotent; tier already exists from 038).

alter table public.profiles
  add column if not exists stripe_customer_id text;

alter table public.profiles
  add column if not exists stripe_subscription_id text;

alter table public.profiles
  add column if not exists subscription_status text default 'active';

alter table public.profiles
  add column if not exists current_period_end timestamptz;

-- Ensure default on subscription_status when column pre-existed without default.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'subscription_status'
  ) then
    alter table public.profiles
      alter column subscription_status set default 'active';
  end if;
end $$;

comment on column public.profiles.stripe_customer_id is
  'Stripe Customer id (cus_…), created on first checkout.';

comment on column public.profiles.stripe_subscription_id is
  'Active Stripe Subscription id (sub_…); null for free and lifetime.';

comment on column public.profiles.subscription_status is
  'Stripe subscription status: active, trialing, canceled, past_due, etc.';

comment on column public.profiles.current_period_end is
  'End of current Stripe billing period (UTC); null for free and lifetime.';
