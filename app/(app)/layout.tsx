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
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        userEmail = user.email ?? "";
      }
    } catch {
      // Supabase not configured — keep mock fallback
    }
  }

  return (
    <div className="relative min-h-screen">
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
