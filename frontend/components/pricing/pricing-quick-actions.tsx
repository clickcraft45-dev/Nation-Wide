import {
  Receipt,
  FileText,
  Fuel,
  Globe,
  MapPinned,
  FileClock,
  type LucideIcon,
} from "lucide-react";
import { ActionTile } from "@/components/ui/action-tile";

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
      {ACTIONS.map((action) => (
        <ActionTile key={action.href} href={action.href} icon={action.icon} label={action.label} />
      ))}
    </div>
  );
}
