import type { PaymentMethodCode } from "./order";

export const EXPENSE_CATEGORIES = [
  "SALARY",
  "RENT",
  "UTILITIES",
  "FUEL",
  "PACKAGING",
  "COURIER_PARTNER",
  "MARKETING",
  "OFFICE_SUPPLIES",
  "TRAVEL",
  "MAINTENANCE",
  "TAXES_FEES",
  "OTHER",
] as const;

export type ExpenseCategoryCode = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategoryCode, string> = {
  SALARY: "Salary",
  RENT: "Rent",
  UTILITIES: "Utilities",
  FUEL: "Fuel",
  PACKAGING: "Packaging",
  COURIER_PARTNER: "Courier Partner",
  MARKETING: "Marketing",
  OFFICE_SUPPLIES: "Office Supplies",
  TRAVEL: "Travel",
  MAINTENANCE: "Maintenance",
  TAXES_FEES: "Taxes & Fees",
  OTHER: "Other",
};

/** One line in the company's outgoing-money ledger. */
export interface ExpenseDto {
  id: string;
  expenseDate: string; // ISO 8601
  category: ExpenseCategoryCode;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethodCode;
  paidTo: string;
  description: string | null;
  referenceNo: string | null;
  recordedBy: { id: string; email: string } | null;
  createdAt: string; // ISO 8601
}

export interface ExpenseListDto {
  items: ExpenseDto[];
  /** Row count for the filter, ignoring pagination. */
  total: number;
  /** Summed amount for the filter, ignoring pagination — the page's headline number. */
  totalAmount: number;
  /** Same window, split by category, biggest first. */
  byCategory: { category: ExpenseCategoryCode; amount: number }[];
}
