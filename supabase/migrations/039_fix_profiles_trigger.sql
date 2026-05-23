-- Fix: profiles not auto-created on signup.
-- Migration 002 defined handle_new_user() but never attached the auth.users trigger.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, tier)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'free'
  )
  on conflict (id) do nothing;

  insert into public.projects (user_id, name, description, is_inbox, pinned, memory_enabled)
  values (
    new.id,
    'Inbox',
    'Default project for standalone chats',
    true,
    true,
    true
  )
  on conflict do nothing;

  return new;
exception
  when others then
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

grant execute on function public.handle_new_user() to supabase_auth_admin;
