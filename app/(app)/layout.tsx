import "@/lib/env/mock-mode-guard";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";
import { mockUser } from "@/lib/mockData";
import { getUserSubscription } from "@/lib/subscription/tier";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let userEmail = mockUser.email;
  let tier = "free";

  if (process.env.MOCK_MODE !== "true") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Middleware already redirects unauthenticated users away from protected
    // routes, but defending in depth here avoids leaking the mock identity if
    // middleware is misconfigured.
    if (!user) redirect("/login");
    userEmail = user.email ?? "";
    const subscription = await getUserSubscription(user.id);
    tier = subscription.tier;
  }

  return (
    <AppShell userEmail={userEmail} tier={tier}>
      {children}
    </AppShell>
  );
}
