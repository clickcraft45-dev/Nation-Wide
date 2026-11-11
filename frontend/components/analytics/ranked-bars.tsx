/**
 * A ranked breakdown (carriers, destinations, spend categories) as labelled horizontal bars.
 * Bars, not a pie: with more than three or four rows a pie turns into a colour-matching puzzle,
 * and every row here carries its value and share in text, so the bar is only the shape.
 */
export function RankedBars({
  rows,
  format = (value: number) => value.toLocaleString("en-IN"),
  empty,
}: {
  rows: { label: string; value: number }[];
  format?: (value: number) => string;
  empty: string;
}) {
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (rows.length === 0 || total === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-foreground">{row.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              <span className="font-medium text-foreground">{format(row.value)}</span> ·{" "}
              {Math.round((row.value / total) * 100)}%
            </span>
          </div>
          <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground/80"
              style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
