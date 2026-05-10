-- Billing / Stripe: tier and Stripe IDs on profiles (updated via webhook).

alter table public.profiles
  add column if not exists subscription_tier text not null default 'free';

alter table public.profiles
  add column if not exists stripe_customer_id text;

alter table public.profiles
  add column if not exists stripe_subscription_id text;

alter table public.profiles
  drop constraint if exists profiles_subscription_tier_check;

alter table public.profiles
  add constraint profiles_subscription_tier_check
  check (subscription_tier in ('free', 'pro', 'power', 'lifetime_byok'));

comment on column public.profiles.subscription_tier is 'Product tier: free, pro, power, or lifetime_byok (Stripe webhook).';
