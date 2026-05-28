"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Header } from "@/components/layout/header";
import { CommandPalette } from "@/components/layout/command-palette";
import { cn } from "@/lib/utils";

interface AppShellProps {
  userEmail?: string;
  children: React.ReactNode;
}

export function AppShell({ userEmail, children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="relative min-h-screen bg-background">
      <Sidebar userEmail={userEmail} collapsed={sidebarCollapsed} />
      <div
        className={cn(
          "flex flex-col min-h-screen transition-[margin] duration-200",
          sidebarCollapsed ? "md:ml-0" : "md:ml-60"
        )}
      >
        <Header
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        />
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">{children}</main>
      </div>
      <BottomNav />
      <CommandPalette />
    </div>
  );
}
