import {
  LayoutDashboard,
  Package,
  Users,
  ClipboardList,
  Truck,
  CreditCard,
  MapPin,
  FileQuestion,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Orders", href: "/admin/orders", icon: Package },
  { label: "Customers", href: "/admin/customers", icon: Users },
  { label: "Shipment Requests", href: "/admin/shipment-requests", icon: ClipboardList },
  { label: "Pickups", href: "/admin/pickups", icon: Truck },
  { label: "Payments", href: "/admin/payments", icon: CreditCard },
  { label: "Tracking", href: "/admin/shipments", icon: MapPin },
  { label: "Quote Requests", href: "/admin/quotes", icon: FileQuestion },
  { label: "Reports", href: "/admin/reports", icon: BarChart3 },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export function findNavItemForPath(pathname: string): NavItem | undefined {
  return [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}
