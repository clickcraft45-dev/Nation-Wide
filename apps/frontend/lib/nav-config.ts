import {
  LayoutDashboard,
  Package,
  PackagePlus,
  Users,
  Truck,
  CreditCard,
  MapPin,
  FileQuestion,
  BarChart3,
  Settings,
  User,
  Tag,
  ClipboardList,
  UserCog,
  CalendarClock,
  Home,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@nationwide/shared-types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  // Omitted means visible to every role that can reach this nav (i.e. all admin-panel roles
  // today). Pricing is the first ADMIN-only exception — see admin/(dashboard)/pricing/layout.tsx.
  roles?: Role[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Grouped so the sidebar tells the admin what each section is *for*, not just an alphabet-soup
// flat list. This is also where "Pickup Requests" (the active workflow) is deliberately separated
// from the legacy "Pickups" records — the two were easy to confuse as the same thing.
export const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Operations",
    items: [
      { label: "Orders", href: "/admin/orders", icon: Package },
      { label: "Pickup Requests", href: "/admin/pickup-requests", icon: ClipboardList },
      { label: "Pickup Partners", href: "/admin/pickup-partners", icon: UserCog },
      { label: "Customers", href: "/admin/customers", icon: Users },
    ],
  },
  {
    label: "Finance",
    items: [{ label: "Payments", href: "/admin/payments", icon: CreditCard }],
  },
  {
    label: "Logistics",
    items: [
      { label: "Tracking", href: "/admin/shipments", icon: MapPin },
      { label: "Quote Requests", href: "/admin/quotes", icon: FileQuestion },
    ],
  },
  {
    label: "Pricing",
    items: [{ label: "Pricing", href: "/admin/pricing", icon: Tag, roles: ["ADMIN"] }],
  },
  {
    label: "Analytics",
    items: [{ label: "Reports", href: "/admin/reports", icon: BarChart3 }],
  },
  {
    label: "System",
    items: [
      // Kept — not deleted — but relabeled and moved away from "Pickup Requests" so it reads as
      // a separate, secondary record rather than a duplicate of the active pickup workflow.
      { label: "Pickups (Legacy)", href: "/admin/pickups", icon: Truck },
      { label: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];

export const ADMIN_NAV_ITEMS: NavItem[] = ADMIN_NAV_GROUPS.flatMap((group) => group.items);

export function filterNavGroupsByRole(groups: NavGroup[], role: Role): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);
}

// A Pickup Partner's dashboard is a wholly separate audience from Orders/Customers/Pricing/etc
// — deliberately its own short list, not a role-filtered slice of ADMIN_NAV_ITEMS.
export const PARTNER_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/partner/dashboard", icon: LayoutDashboard },
  { label: "Scheduled Pickups", href: "/partner/pickups", icon: CalendarClock },
];

// Full nav — surfaced in the mobile shell's hamburger drawer (see CustomerMobileShell). Kept
// separate from the 4-item bottom tab bar below so My Orders/My Quotes stay reachable without
// crowding the tab bar the approved design calls for.
export const CUSTOMER_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "My Orders", href: "/orders", icon: Package },
  { label: "My Quotes", href: "/quotes", icon: FileQuestion },
  { label: "Track a Shipment", href: "/tracking", icon: MapPin },
  { label: "Profile", href: "/profile", icon: User },
];

// The customer app's bottom tab bar: Home / Ship / Track / Profile, per the approved design.
export const CUSTOMER_TAB_ITEMS: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Ship", href: "/quote", icon: PackagePlus },
  { label: "Track", href: "/tracking", icon: MapPin },
  { label: "Profile", href: "/profile", icon: User },
];

export function findNavItemForPath(
  pathname: string,
  items: NavItem[],
): NavItem | undefined {
  return [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}
