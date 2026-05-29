// IMPORTANT: Server-side only — never import this in client components.
// Uses the service role key, which bypasses Row Level Security.
// Only use for vault operations that require elevated privileges.

import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_SECRET;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase service role credentials are not configured. " +
        "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_SECRET."
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
