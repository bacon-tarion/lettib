-- Unify billing tier on profiles.tier (app + Stripe webhook read/write this column).

alter table public.profiles
  add column if not exists tier text not null default 'free';

-- Backfill from legacy subscription_tier when that column still exists.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'subscription_tier'
  ) then
    execute $sql$
      update public.profiles
      set tier = subscription_tier
      where subscription_tier is not null
        and subscription_tier <> tier
    $sql$;
  end if;
end $$;

alter table public.profiles
  drop constraint if exists profiles_tier_check;

alter table public.profiles
  add constraint profiles_tier_check
  check (tier in ('free', 'pro', 'power', 'lifetime_byok'));

comment on column public.profiles.tier is
  'Product tier: free, pro, power, or lifetime_byok (Stripe webhook).';
