import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Header } from "@/components/layout/header";
import { CommandPalette } from "@/components/layout/command-palette";
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

  return (
    <div className="relative min-h-screen bg-background">
      <Sidebar userEmail={userEmail} />
      <div className="md:ml-60 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">{children}</main>
      </div>
      <BottomNav />
      <CommandPalette />
    </div>
  );
}
