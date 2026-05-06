import { ReactNode } from "react";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await requireAdmin();
  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar userEmail={admin.email} />
      <main className="md:ml-60 p-6 md:p-8 max-w-6xl">{children}</main>
    </div>
  );
}
