"use client";

import Link from "next/link";
import {
  PlusCircle,
  MapPin,
  FileQuestion,
  Users,
  CreditCard,
  Truck,
  ClipboardList,
  ReceiptIndianRupee,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@nationwide/shared-types";
import { useAuth } from "@/state/auth-context";

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Omitted means every admin-panel role sees it — matches NavItem.roles in nav-config. */
  roles?: Role[];
}

const ACTIONS: QuickAction[] = [
  { label: "Create Order", href: "/admin/orders", icon: PlusCircle },
  { label: "Track Shipment", href: "/admin/shipments", icon: MapPin },
  { label: "Generate Quote", href: "/admin/quotes", icon: FileQuestion },
  // ADMIN-only, mirroring the GST Invoices nav item and the controller's own guard — an OPS user
  // following this tile would only reach a 403.
  { label: "Generate Invoice", href: "/admin/invoices", icon: ReceiptIndianRupee, roles: ["ADMIN"] },
  { label: "View Customers", href: "/admin/customers", icon: Users },
  { label: "View Payments", href: "/admin/payments", icon: CreditCard },
  { label: "Schedule Pickup", href: "/admin/pickups", icon: Truck },
  // /admin/shipment-requests has never existed — the route is pickup-requests (see
  // app/admin/(dashboard)/, and "Pickup Requests" in nav-config). This tile was a 404.
  { label: "Pickup Requests", href: "/admin/pickup-requests", icon: ClipboardList },
];

export function QuickActions() {
  const { user } = useAuth();
  const actions = ACTIONS.filter(
    (action) => !action.roles || (user && action.roles.includes(user.role)),
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.href}
            href={action.href}
            className="glass glass-interactive glass-sheen flex flex-col items-center gap-2 rounded-2xl px-4 py-5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon className="h-5 w-5 text-primary" aria-hidden />
            <span className="text-xs font-medium text-foreground">{action.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
