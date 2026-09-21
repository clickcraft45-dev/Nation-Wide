import {
  LayoutDashboard,
  Warehouse,
  History,
  Inbox,
  Package,
  PackagePlus,
  Users,
  Truck,
  CreditCard,
  ReceiptIndianRupee,
  Wallet,
  MapPin,
  FileQuestion,
  BarChart3,
  MessageCircle,
  Send,
  Settings,
  User,
  Tag,
  ClipboardList,
  Link2,
  Crown,
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
  // Rail icon for the two-level sidebar. Optional: defaults to the first item's icon, which is
  // already the right mark for every group but "System".
  icon?: LucideIcon;
  label: string;
  items: NavItem[];
}

// Grouped so the sidebar tells the admin what each section is *for*, not just an alphabet-soup
// flat list. This is also where "Pickup Requests" (the active workflow) is deliberately separated
// from the legacy "Pickups" records — the two were easy to confuse as the same thing.
export const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
      // The whole company on one screen — payroll, margin and headcount together, which is why
      // it is the one item an ordinary ADMIN does not see.
      {
        label: "Command Centre",
        href: "/admin/command-centre",
        icon: Crown,
        roles: ["SUPER_ADMIN"],
      },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Orders", href: "/admin/orders", icon: Package },
      { label: "Pickup Requests", href: "/admin/pickup-requests", icon: ClipboardList },
      { label: "Warehouse Drop-offs", href: "/admin/warehouse-dropoffs", icon: Warehouse },
      // One directory for customers, businesses, partners and staff — the slider picks the
      // audience, and the create button follows it.
      { label: "People", href: "/admin/people", icon: Users },
      // ADMIN-only, matching AdminB2bLinksController: whoever holds a link can place orders
      // billed to that customer, so issuing one is the same bar as company settings.
      { label: "B2B Links", href: "/admin/b2b-links", icon: Link2, roles: ["ADMIN"] },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Payments", href: "/admin/payments", icon: CreditCard },
      // ADMIN-only, matching the controller: issuing a tax invoice is a financial act with a
      // permanent numbered record, not an operational one.
      {
        label: "GST Invoices",
        href: "/admin/invoices",
        icon: ReceiptIndianRupee,
        roles: ["ADMIN"],
      },
      // ADMIN-only for the same reason: payroll and rent are not operational data.
      { label: "Expenses", href: "/admin/expenses", icon: Wallet, roles: ["ADMIN"] },
    ],
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
    icon: Settings,
    items: [
      // Kept — not deleted — but relabeled and moved away from "Pickup Requests" so it reads as
      // a separate, secondary record rather than a duplicate of the active pickup workflow.
      { label: "Pickups (Legacy)", href: "/admin/pickups", icon: Truck },
      { label: "Send Email", href: "/admin/mail", icon: Send },
      { label: "Send WhatsApp", href: "/admin/whatsapp", icon: MessageCircle, roles: ["ADMIN"] },
      { label: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];

export const ADMIN_NAV_ITEMS: NavItem[] = ADMIN_NAV_GROUPS.flatMap((group) => group.items);

/**
 * Whether this role may see an item. SUPER_ADMIN is a superset of ADMIN — stated once here, the
 * same rule the server's RolesGuard applies, so the menu and the API can never disagree about who
 * sees what.
 */
export function canSeeNavItem(item: NavItem, role: Role): boolean {
  if (!item.roles) return true;
  if (item.roles.includes(role)) return true;
  return role === "SUPER_ADMIN" && item.roles.includes("ADMIN");
}

export function filterNavGroupsByRole(groups: NavGroup[], role: Role): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canSeeNavItem(item, role)),
    }))
    .filter((group) => group.items.length > 0);
}

// A Pickup Partner's dashboard is a wholly separate audience from Orders/Customers/Pricing/etc
// — deliberately its own short list, not a role-filtered slice of ADMIN_NAV_ITEMS.
export const PARTNER_NAV_ITEMS: NavItem[] = [
  { label: "Requests", href: "/partner/requests", icon: Inbox },
  { label: "Dashboard", href: "/partner/dashboard", icon: LayoutDashboard },
  { label: "Pickups", href: "/partner/pickups", icon: CalendarClock },
  { label: "History", href: "/partner/history", icon: History },
];

// Full nav — surfaced in the mobile shell's hamburger drawer (see CustomerMobileShell). Kept
// separate from the 4-item bottom tab bar below so My Orders/My Quotes stay reachable without
// crowding the tab bar the approved design calls for.
export const CUSTOMER_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "My Orders", href: "/orders", icon: Package },
  { label: "My Quotes", href: "/quotes", icon: FileQuestion },
  // Invoices AND payment receipts — both documents a customer files, in one place.
  { label: "Invoices & Receipts", href: "/documents", icon: ReceiptIndianRupee },
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

export function findNavItemForPath(pathname: string, items: NavItem[]): NavItem | undefined {
  return [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}
