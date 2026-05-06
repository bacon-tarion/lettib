"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, Users, BarChart3, ArrowLeft, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/actions/auth";

const navItems = [
  { href: "/admin", label: "Overview", icon: Shield, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/usage", label: "Usage", icon: BarChart3 },
];

interface AdminSidebarProps {
  userEmail: string;
}

export function AdminSidebar({ userEmail }: AdminSidebarProps) {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 h-screen w-60 border-r bg-sidebar z-40">
      <div className="px-5 py-4 border-b">
        <Link href="/admin" className="flex items-center gap-2">
          <Shield className="h-4 w-4" />
          <span className="text-sm font-bold tracking-tight text-sidebar-foreground">
            LettiB Admin
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}

        <div className="pt-3 mt-3 border-t">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            Back to app
          </Link>
        </div>
      </nav>

      <div className="p-4 border-t space-y-2">
        <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log out
          </button>
        </form>
      </div>
    </aside>
  );
}
