import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function KpiCard({
  title,
  value,
  icon: Icon,
  href,
  isLoading,
  hint,
}: {
  title: string;
  value: number | string;
  icon: LucideIcon;
  href: string;
  isLoading?: boolean;
  hint?: string;
}) {
  return (
    <Link href={href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="flex items-start justify-between pt-5">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <p className="text-2xl font-semibold text-foreground">{value}</p>
            )}
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4.5 w-4.5" aria-hidden />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
