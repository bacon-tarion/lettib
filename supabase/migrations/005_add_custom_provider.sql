-- Add 'custom' provider and supporting columns to api_connections
-- Run this in the Supabase SQL Editor.

ALTER TABLE api_connections
DROP CONSTRAINT IF EXISTS api_connections_provider_check;

ALTER TABLE api_connections
ADD CONSTRAINT api_connections_provider_check
CHECK (provider IN ('openai', 'anthropic', 'google', 'xai', 'custom'));

ALTER TABLE api_connections
ADD COLUMN IF NOT EXISTS custom_base_url TEXT;

ALTER TABLE api_connections
ADD COLUMN IF NOT EXISTS custom_model_name TEXT;
