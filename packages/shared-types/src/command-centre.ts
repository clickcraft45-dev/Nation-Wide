/** A labelled count — a bar, a slice, a row. */
export interface LabelledCountDto {
  label: string;
  count: number;
}

export interface PeriodMoneyDto {
  /** First day of the bucket, YYYY-MM-DD (IST). */
  start: string;
  revenue: number;
  expenses: number;
  profit: number;
}

/**
 * The company-wide picture behind the SUPER_ADMIN dashboard.
 *
 * Revenue is money COLLECTED (paid orders, by the day they were paid), not invoiced. It is the same
 * definition the reports use, so the two screens never disagree about what came in.
 */
export interface CommandCentreDto {
  from: string;
  to: string;
  bucket: "day" | "week" | "month";
  /** Oldest first, gaps included as zeroes so the chart keeps its shape. */
  series: PeriodMoneyDto[];
  money: {
    revenue: number;
    expenses: number;
    profit: number;
    /** The same three for the equal-length window just before, for the change badges. */
    previousRevenue: number;
    previousExpenses: number;
    /** Null when there is no revenue to take a share of — not zero, which would read as breaking even. */
    marginPercent: number | null;
    receivedToday: number;
    spentToday: number;
    unpaidOrders: number;
  };
  expensesByCategory: { category: string; amount: number }[];
  people: {
    customers: number;
    b2bCustomers: number;
    superAdmins: number;
    admins: number;
    deactivatedAdmins: number;
    partners: number;
    activePartners: number;
  };
  partnerLeaderboard: {
    partnerId: string;
    name: string;
    completed: number;
    collected: number;
  }[];
}
