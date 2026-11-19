import type { LabelledCountDto } from "./command-centre";

/** How the series is bucketed: days up to ~2 months, weeks up to ~6, months beyond. */
export type AnalyticsBucket = "day" | "week" | "month";

/** One window's headline numbers. Rates and averages are derived from these on the client. */
export interface AnalyticsTotalsDto {
  orders: number;
  /** Orders whose every shipment has been delivered. */
  delivered: number;
  cancelled: number;
  shipments: number;
  /** Money collected in the window: paid orders by the day they were paid, not placed. */
  revenue: number;
  paidOrders: number;
  newCustomers: number;
  quotes: number;
  /** Quotes from the window that have since become orders. */
  convertedQuotes: number;
}

export interface AnalyticsPointDto {
  /** First day of the bucket, YYYY-MM-DD (IST). */
  start: string;
  orders: number;
  delivered: number;
  revenue: number;
  newCustomers: number;
}

/**
 * GET /admin/analytics?from&to — every figure on the dashboard and reports, aggregated on the
 * server for the window and for the equal-length window just before it.
 */
export interface AnalyticsDto {
  from: string;
  to: string;
  bucket: AnalyticsBucket;
  current: AnalyticsTotalsDto;
  previous: AnalyticsTotalsDto;
  series: AnalyticsPointDto[];
  shipmentStatus: LabelledCountDto[];
  carriers: LabelledCountDto[];
  destinations: LabelledCountDto[];
  paymentMethods: { label: string; amount: number }[];
}
