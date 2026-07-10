"use client";



import Link from "next/link";

import { usePathname } from "next/navigation";

import {

  LayoutDashboard,

  FolderOpen,

  GitCompare,

  ClipboardList,

  MessageSquare,

  Users,

  BarChart2,

  Settings,

  LogOut,

} from "lucide-react";

import { cn } from "@/lib/utils";

import { signOut } from "@/app/actions/auth";

import { FeedbackButton } from "@/components/feedback/feedback-button";

import { SidebarChats } from "@/components/layout/sidebar-chats";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { tierDisplayName } from "@/lib/subscription/tier";



const navItems = [

  { href: "/dashboard", label: "Home", icon: LayoutDashboard },

  { href: "/projects", label: "Projects", icon: FolderOpen },

  { href: "/compare", label: "Compare", icon: GitCompare },

  { href: "/manual-compare", label: "Manual Compare", icon: ClipboardList },

  { href: "/chat", label: "Chat", icon: MessageSquare },

  { href: "/teams", label: "Teams", icon: Users },

  { href: "/settings", label: "Settings", icon: Settings },

  { href: "/usage", label: "Usage", icon: BarChart2 },

];



interface SidebarProps {

  userEmail?: string;

  tier?: string;

  collapsed?: boolean;

  onToggleCollapse?: () => void;

}



export function Sidebar({ userEmail, tier = "free", collapsed = false }: SidebarProps) {

  const pathname = usePathname();



  return (

    <aside

      className={cn(

        "hidden md:flex flex-col fixed left-0 top-0 h-screen border-r bg-sidebar z-40 transition-all duration-200 overflow-hidden",

        collapsed ? "w-0 border-r-0" : "w-60"

      )}

      aria-hidden={collapsed}

    >

      <div className="px-5 py-4 border-b shrink-0 w-60">

        <span className="text-xl font-bold tracking-tight text-sidebar-foreground">

          LettiB

        </span>

      </div>



      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5 w-60">

        {navItems.map((item) => {

          const Icon = item.icon;

          const isActive =

            pathname === item.href ||

            (item.href !== "/dashboard" && pathname.startsWith(item.href));

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

        <SidebarChats />

      </nav>



      <div className="p-4 border-t space-y-1 shrink-0 w-60">

        {userEmail && (

          <p className="text-xs text-muted-foreground truncate pb-1">{userEmail}</p>

        )}

        <div className="pb-2 space-y-2">
          <Badge
            variant="secondary"
            className="text-[11px] font-medium bg-sidebar-accent text-sidebar-accent-foreground border-sidebar-border"
          >
            {tierDisplayName(tier)}
          </Badge>
          {tier === "free" && (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground leading-snug">
                Compare 2 models · 5 projects · 7-day history
              </p>
              <Button asChild variant="default" size="sm" className="w-full">
                <Link href="/settings/subscription">Upgrade</Link>
              </Button>
            </div>
          )}
        </div>

        <FeedbackButton />

        <form action={signOut}>

          <button

            type="submit"

            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"

          >

            <LogOut className="h-3.5 w-3.5" />

            Log out

          </button>

        </form>

      </div>

    </aside>

  );

}


