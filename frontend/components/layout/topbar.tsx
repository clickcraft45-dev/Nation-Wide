"use client";

import { usePathname, useRouter } from "next/navigation";
import { LogOut, User as UserIcon, ChevronRight } from "lucide-react";
import { NotificationsBell } from "@/components/pwa/notifications-bell";
import type { AuthUserDto } from "@nationwide/shared-types";
import { useAuth } from "@/state/auth-context";
import { findNavItemForPath, navItemMatch, type NavItem } from "@/lib/nav-config";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

function Breadcrumbs({ pathname, items }: { pathname: string; items: NavItem[] }) {
  const current = findNavItemForPath(pathname, items);
  // Under the item's own href the rest of the path follows it; under one of its alsoMatches pages
  // that page's own name does ("Providers and rates > Rate sheets").
  const matched = current ? navItemMatch(current, pathname) : undefined;
  const matchedDepth = !matched
    ? 0
    : matched === current?.href
      ? matched.split("/").filter(Boolean).length
      : matched.split("/").filter(Boolean).length - 1;
  // Slugs read as words ("bulk-edit" → "Bulk edit"); a raw UUID tells the admin nothing, so it is
  // left out rather than shown as "d4f71de0-5892…".
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .slice(matchedDepth)
    .filter((s) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s))
    .map((s) => {
      const words = decodeURIComponent(s).replace(/-/g, " ");
      return words.charAt(0).toUpperCase() + words.slice(1);
    });

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      <span className="font-medium text-foreground">{current?.label ?? "Dashboard"}</span>
      {segments.length > 0 &&
        segments.map((segment, i) => (
          <span key={i} className="flex items-center gap-1.5 text-muted-foreground">
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            <span className="max-w-[16rem] truncate">{segment}</span>
          </span>
        ))}
    </nav>
  );
}

export function Topbar({
  user,
  items,
  profileHref,
}: {
  user: AuthUserDto;
  items: NavItem[];
  profileHref: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  async function handleLogout() {
    await logout();
    router.replace("/");
  }

  return (
    <header className="glass-chrome z-20 flex h-14 shrink-0 items-center gap-3 border-b border-white/40 px-4">
      <Breadcrumbs pathname={pathname} items={items} />

      <div className="ml-auto flex items-center gap-3">
        <NotificationsBell className="rounded-full hover:bg-white/60" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar label={user.email} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>
              <div className="truncate">{user.email}</div>
              <div className="font-normal text-muted-foreground">{user.role}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push(profileHref)}>
              <UserIcon className="h-4 w-4" aria-hidden />
              Profile & Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-danger">
              <LogOut className="h-4 w-4" aria-hidden />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
