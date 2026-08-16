"use client";

import { useState, type ReactNode } from "react";
import type { AuthUserDto } from "@nationwide/shared-types";
import type { NavItem, NavGroup } from "@/lib/nav-config";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function DashboardShell({
  user,
  items,
  groups,
  profileHref,
  children,
}: {
  user: AuthUserDto;
  /** Flat list — drives topbar breadcrumb matching regardless of how the sidebar groups them. */
  items: NavItem[];
  /** Optional grouped rendering for the sidebar (e.g. admin's Overview/Operations/Finance/…).
   * Omit for a flat, unlabeled list (customer nav is short enough not to need sections). */
  groups?: NavGroup[];
  profileHref: string;
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        items={items}
        groups={groups}
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
        <main className="flex-1 overflow-y-auto bg-background p-6">{children}</main>
      </div>
    </div>
  );
}
