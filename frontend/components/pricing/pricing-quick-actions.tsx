import {
  Ban,
  Receipt,
  FileSpreadsheet,
  FileText,
  Fuel,
  Globe,
  FileClock,
  MapPinned,
  type LucideIcon,
} from "lucide-react";
import { ActionTile } from "@/components/ui/action-tile";

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Grouped by what an admin is doing. The sidebar's Pricing group lists the same pages in the
// same order (lib/nav-config.ts); keep the two in step.
const GROUPS: { title: string; actions: QuickAction[] }[] = [
  {
    title: "Rates",
    actions: [
      { label: "Providers & rates", href: "/admin/pricing/providers", icon: Receipt },
      { label: "Rate sheets", href: "/admin/pricing/rate-sheets", icon: FileSpreadsheet },
      { label: "Zones", href: "/admin/pricing/zones", icon: MapPinned },
    ],
  },
  {
    title: "Charges on top",
    actions: [
      { label: "Fuel, PSS & margins", href: "/admin/pricing/fuel-pss", icon: Fuel },
      { label: "Cancellation charges", href: "/admin/pricing/fuel-pss?section=cancellation", icon: Ban },
    ],
  },
  {
    title: "Destinations",
    actions: [{ label: "Countries", href: "/admin/pricing/countries", icon: Globe }],
  },
  {
    title: "Publish and audit",
    actions: [
      { label: "Rate card PDFs", href: "/admin/pricing/pdf-generator", icon: FileText },
      { label: "Rate history", href: "/admin/pricing/rate-history", icon: FileClock },
    ],
  },
];

export function PricingQuickActions() {
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-5">
      {GROUPS.map((group) => (
        <section key={group.title} aria-labelledby={`pricing-group-${group.title}`} className="w-full space-y-2 sm:w-auto">
          <h2 id={`pricing-group-${group.title}`} className="text-xs font-medium text-muted-foreground">
            {group.title}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            {group.actions.map((action) => (
              <ActionTile
                key={action.href}
                href={action.href}
                icon={action.icon}
                label={action.label}
                className="sm:w-36"
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
