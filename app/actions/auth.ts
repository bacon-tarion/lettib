"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function getSiteUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const proto = host.includes("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

/** Same-origin path only — avoids open redirects. */
function safeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//") || t.includes("://")) {
    return null;
  }
  return t;
}

function signupRedirectPath(formData: FormData): string {
  const plan = (formData.get("plan") as string | null)?.trim();
  if (plan === "pro" || plan === "power" || plan === "lifetime") {
    return `/pricing?plan=${plan}`;
  }
  return "/dashboard";
}

export async function signIn(_prev: unknown, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  const next = safeNextPath(formData.get("next") as string | null);
  redirect(next ?? "/dashboard");
}

export async function signUp(_prev: unknown, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const displayName = (formData.get("display_name") as string).trim();

  if (!email || !password || !displayName) {
    return { error: "All fields are required." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Supabase returned a session immediately (email confirmation is disabled
  // in project settings) — user is already authenticated.
  if (data.session) {
    redirect(signupRedirectPath(formData));
  }

  // No session yet means email confirmation is enabled. Attempt an immediate
  // sign-in anyway: if "Confirm email" is turned OFF in Supabase Auth settings
  // this will succeed and grant a session. If it is ON, the sign-in will fail
  // with "Email not confirmed" and the user must click their confirmation link.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (!signInError) {
    redirect(signupRedirectPath(formData));
  }

  // Email confirmation is genuinely required — let the user know rather than
  // silently bouncing them off the dashboard with no explanation.
  return {
    error:
      "Account created! Please check your email and click the confirmation link before signing in.",
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
