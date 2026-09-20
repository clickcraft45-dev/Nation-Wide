/** A labelled count — a bar, a slice, a row. */
export interface LabelledCountDto {
  label: string;
  count: number;
}

export interface MonthlyMoneyDto {
  /** "2026-09" */
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
}

/**
 * The company-wide picture behind the SUPER_ADMIN dashboard.
 *
 * Revenue is money RECEIVED (receipts), not invoiced — comparing outgoings against what has merely
 * been billed answers a question nobody asked.
 */
export interface CommandCentreDto {
  /** Six months, oldest first, gaps included as zeroes so the line keeps its shape. */
  months: MonthlyMoneyDto[];
  money: {
    revenue: number;
    expenses: number;
    profit: number;
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
  work: {
    ordersByStatus: LabelledCountDto[];
    pickupsByStatus: LabelledCountDto[];
    quotesAwaiting: number;
  };
  topDestinations: LabelledCountDto[];
  partnerLeaderboard: {
    partnerId: string;
    name: string;
    completed: number;
    collected: number;
  }[];
}
