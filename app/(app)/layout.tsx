import "@/lib/env/mock-mode-guard";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";
import { mockUser } from "@/lib/mockData";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let userEmail = mockUser.email;

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
  }

  return <AppShell userEmail={userEmail}>{children}</AppShell>;
}
