import {
  LayoutDashboard,
  Package,
  Users,
  Truck,
  CreditCard,
  MapPin,
  FileQuestion,
  BarChart3,
  Settings,
  User,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Orders", href: "/admin/orders", icon: Package },
  { label: "Customers", href: "/admin/customers", icon: Users },
  { label: "Pickups", href: "/admin/pickups", icon: Truck },
  { label: "Payments", href: "/admin/payments", icon: CreditCard },
  { label: "Tracking", href: "/admin/shipments", icon: MapPin },
  { label: "Quote Requests", href: "/admin/quotes", icon: FileQuestion },
  { label: "Reports", href: "/admin/reports", icon: BarChart3 },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export const CUSTOMER_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "My Orders", href: "/orders", icon: Package },
  { label: "My Quotes", href: "/quotes", icon: FileQuestion },
  { label: "Track a Shipment", href: "/tracking", icon: MapPin },
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
