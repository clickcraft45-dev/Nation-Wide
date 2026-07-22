import Link from "next/link";
import {
  PlusCircle,
  MapPin,
  FileQuestion,
  Users,
  CreditCard,
  Truck,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
}

const ACTIONS: QuickAction[] = [
  { label: "Create Order", href: "/admin/orders", icon: PlusCircle },
  { label: "Track Shipment", href: "/admin/shipments", icon: MapPin },
  { label: "Generate Quote", href: "/admin/quotes", icon: FileQuestion },
  { label: "View Customers", href: "/admin/customers", icon: Users },
  { label: "View Payments", href: "/admin/payments", icon: CreditCard },
  { label: "Schedule Pickup", href: "/admin/pickups", icon: Truck },
  { label: "Create Shipment Request", href: "/admin/shipment-requests", icon: ClipboardList },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.href}
            href={action.href}
            className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-4 py-5 text-center transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon className="h-5 w-5 text-primary" aria-hidden />
            <span className="text-xs font-medium text-foreground">{action.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
