import { type ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { Button } from "./button";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass flex flex-col items-center justify-center gap-3 rounded-2xl border-dashed py-16 text-center">
      <div className="text-muted-foreground">
        {icon ?? <Inbox className="h-8 w-8" aria-hidden />}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="glass-pill flex flex-col items-center justify-center gap-3 rounded-2xl border border-danger-border bg-[color-mix(in_srgb,var(--danger-bg)_84%,transparent)] py-16 text-center">
      <AlertTriangle className="h-8 w-8 text-danger" aria-hidden />
      <p className="max-w-sm text-sm text-danger">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
