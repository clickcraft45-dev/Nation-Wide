import Link from "next/link";
import {
  Receipt,
  FileText,
  Fuel,
  Globe,
  MapPinned,
  FileClock,
  type LucideIcon,
} from "lucide-react";

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
}

const ACTIONS: QuickAction[] = [
  { label: "Update Rates", href: "/admin/pricing/rate-management", icon: Receipt },
  { label: "Generate Rate Card PDF", href: "/admin/pricing/pdf-generator", icon: FileText },
  { label: "Update Fuel & PSS", href: "/admin/pricing/fuel-pss", icon: Fuel },
  { label: "Add Country", href: "/admin/pricing/countries", icon: Globe },
  { label: "Add Zone", href: "/admin/pricing/zones", icon: MapPinned },
  { label: "View Rate History", href: "/admin/pricing/rate-history", icon: FileClock },
];

export function PricingQuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.href}
            href={action.href}
            className="glass glass-interactive glass-sheen flex flex-col items-center gap-2 rounded-2xl px-4 py-5 text-center transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon className="h-5 w-5 text-primary" aria-hidden />
            <span className="text-xs font-medium text-foreground">{action.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
