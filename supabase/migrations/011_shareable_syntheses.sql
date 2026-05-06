-- ─── Shareable Synthesis Links ────────────────────────────────────────────────
-- Adds share_token + is_public columns. Anon role gets column-level SELECT on
-- a *whitelist* of safe columns (excluding share_token, user_id, costs, etc.)
-- so direct supabase-js queries from the browser cannot enumerate tokens.
-- The public /share/[token] page uses the service-role client for the read
-- (defense in depth) with a strict `is_public=true AND share_token=$1` filter.

alter table public.syntheses
  add column if not exists share_token uuid unique;

alter table public.syntheses
  add column if not exists is_public boolean default false not null;

create index if not exists syntheses_share_token_idx
  on public.syntheses (share_token)
  where share_token is not null;

create index if not exists syntheses_is_public_idx
  on public.syntheses (is_public)
  where is_public = true;

-- Anon may SELECT public rows (RLS row-gate). Token possession is the secret;
-- column-level grants below prevent anon from harvesting share_token values.
drop policy if exists "public_share_read" on public.syntheses;
create policy "public_share_read" on public.syntheses
  for select
  to anon
  using (is_public = true and share_token is not null);

-- Revoke any blanket grant first, then grant only the safe display columns.
revoke select on public.syntheses from anon;

grant select
  (id, prompt, content, provider, model, tone, source_response_ids,
   created_at, is_public)
  on public.syntheses to anon;
