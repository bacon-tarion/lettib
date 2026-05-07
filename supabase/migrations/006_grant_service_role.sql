-- Grant service_role full access to api_connections so server actions can read/write rows.
-- The service_role key is used by Vault wrapper functions and all server-side actions.
-- Run this in the Supabase SQL Editor.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_connections TO service_role;
