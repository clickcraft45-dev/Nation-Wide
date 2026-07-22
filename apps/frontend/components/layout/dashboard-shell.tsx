"use client";

import { useState, type ReactNode } from "react";
import type { AuthUserDto } from "@nationwide/shared-types";
import type { NavItem } from "@/lib/nav-config";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function DashboardShell({
  user,
  items,
  profileHref,
  children,
}: {
  user: AuthUserDto;
  items: NavItem[];
  profileHref: string;
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        items={items}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          items={items}
          profileHref={profileHref}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <main className="flex-1 overflow-y-auto bg-muted/40 p-6">{children}</main>
      </div>
    </div>
  );
}
