import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns the current authenticated admin user, or triggers a 404 (NOT 403)
 * if either:
 *   - no user is signed in, or
 *   - the user's email is not in ALLOWED_ADMIN_EMAILS.
 *
 * Returning notFound() ensures the existence of the admin surface is never
 * disclosed to non-admins.
 */
export async function requireAdmin(): Promise<{ id: string; email: string }> {
  const allowlistRaw = process.env.ALLOWED_ADMIN_EMAILS ?? "";
  const allowlist = new Set(
    allowlistRaw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    notFound();
  }
  const email = user.email.toLowerCase();
  if (allowlist.size === 0 || !allowlist.has(email)) {
    notFound();
  }
  return { id: user.id, email };
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = (process.env.ALLOWED_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}
