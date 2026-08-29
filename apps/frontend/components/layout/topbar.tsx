"use client";

import { usePathname, useRouter } from "next/navigation";
import { Menu, Bell, LogOut, User as UserIcon, ChevronRight } from "lucide-react";
import type { AuthUserDto } from "@nationwide/shared-types";
import { useAuth } from "@/state/auth-context";
import { findNavItemForPath, type NavItem } from "@/lib/nav-config";
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
  const matchedDepth = current ? current.href.split("/").filter(Boolean).length : 0;
  const segments = pathname.split("/").filter(Boolean).slice(matchedDepth);

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      <span className="font-medium text-foreground">{current?.label ?? "Dashboard"}</span>
      {segments.length > 0 &&
        segments.map((segment, i) => (
          <span key={i} className="flex items-center gap-1.5 text-muted-foreground">
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            <span className="max-w-[16rem] truncate">{decodeURIComponent(segment)}</span>
          </span>
        ))}
    </nav>
  );
}

export function Topbar({
  user,
  items,
  profileHref,
  onOpenMobileNav,
}: {
  user: AuthUserDto;
  items: NavItem[];
  profileHref: string;
  onOpenMobileNav: () => void;
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
      <button
        onClick={onOpenMobileNav}
        aria-label="Open navigation menu"
        className="text-muted-foreground hover:text-foreground lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      <Breadcrumbs pathname={pathname} items={items} />

      <div className="ml-auto flex items-center gap-3">
        <button
          aria-label="Notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="h-4.5 w-4.5" aria-hidden />
        </button>

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
