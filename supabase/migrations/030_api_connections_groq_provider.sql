-- Allow Groq as a BYOK provider in api_connections (Settings Vault keys).
alter table public.api_connections
  drop constraint if exists api_connections_provider_check;

alter table public.api_connections
  add constraint api_connections_provider_check
  check (provider in ('openai', 'anthropic', 'google', 'groq', 'xai', 'custom'));
