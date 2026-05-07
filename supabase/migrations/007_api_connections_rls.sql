-- Enable RLS and add policies for api_connections so the user-scoped client works correctly.
-- Run this in the Supabase SQL Editor.

ALTER TABLE api_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own connections"
  ON api_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users can insert own connections"
  ON api_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own connections"
  ON api_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "users can delete own connections"
  ON api_connections FOR DELETE
  USING (auth.uid() = user_id);
