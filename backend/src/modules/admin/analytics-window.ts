import { BadRequestException } from '@nestjs/common';
import type { AnalyticsBucket } from '@nationwide/shared-types';

// Days are Indian days. Bucketing on UTC put every order placed between midnight and 05:30 IST
// on the previous day's bar.
const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const MAX_DAYS = 731;

export function istDay(date: Date): string {
  return new Date(date.getTime() + IST_MS).toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function daysFrom(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS,
  );
}

/** The instant an IST day begins. */
function istMidnight(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - IST_MS);
}

interface AnalyticsWindow {
  from: string;
  to: string;
  bucket: AnalyticsBucket;
  /** Bucket start days, oldest first, every one present even when nothing happened in it. */
  keys: string[];
  /** Start of the window, its exclusive end, and the start of the equal window before it. */
  start: Date;
  end: Date;
  previousStart: Date;
  /** The bucket a moment falls in, or null outside the window. */
  keyOf(date: Date): string | null;
}

/**
 * The reporting window behind the dashboard, reports and command centre: inclusive IST days
 * `from`..`to`, the equal-length window just before it (for change badges), and buckets sized so
 * the chart stays readable: days up to ~2 months, weeks up to ~6, then calendar months.
 */
export function analyticsWindow(
  from: string | undefined,
  to: string | undefined,
  defaultDays: number,
): AnalyticsWindow {
  const today = istDay(new Date());
  const end = to && to < today ? to : today;
  const start = from ?? addDays(end, -(defaultDays - 1));
  if (start > end)
    throw new BadRequestException('"from" must not be after "to"');
  const days = daysFrom(start, end) + 1;
  if (days > MAX_DAYS)
    throw new BadRequestException('Pick a range of two years or less');

  const bucket: AnalyticsBucket =
    days <= 62 ? 'day' : days <= 182 ? 'week' : 'month';
  const bucketOf = (day: string): string => {
    if (bucket === 'day') return day;
    if (bucket === 'week')
      return addDays(start, Math.floor(daysFrom(start, day) / 7) * 7);
    const month = `${day.slice(0, 7)}-01`;
    return month < start ? start : month;
  };

  const keys: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const key = bucketOf(d);
    if (keys.at(-1) !== key) keys.push(key);
  }

  return {
    from: start,
    to: end,
    bucket,
    keys,
    start: istMidnight(start),
    end: istMidnight(addDays(end, 1)),
    previousStart: istMidnight(addDays(start, -days)),
    keyOf(date) {
      const day = istDay(date);
      return day < start || day > end ? null : bucketOf(day);
    },
  };
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Counts into labelled rows, biggest first; past `limit` the tail folds into "Other". */
export function ranked(
  counts: Map<string, number>,
  limit: number,
): { label: string; count: number }[] {
  const rows = [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  if (rows.length <= limit) return rows;
  const other = rows.slice(limit - 1).reduce((sum, r) => sum + r.count, 0);
  return [...rows.slice(0, limit - 1), { label: 'Other', count: other }];
}

export function bump(counts: Map<string, number>, key: string, by = 1): void {
  counts.set(key, (counts.get(key) ?? 0) + by);
}
