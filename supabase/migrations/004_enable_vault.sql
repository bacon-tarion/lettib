-- Enable Supabase Vault for encrypted secret storage
-- Run this in the Supabase SQL Editor before using API key storage.
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
