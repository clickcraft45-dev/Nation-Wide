import type { PaymentMethodCode } from "./order";

/**
 * An expense heading, with its subcategories nested one level deep.
 *
 * `spent` includes everything filed under the subcategories too — a parent reading ₹0 while a
 * child under it holds ₹4,000 reads as a bug rather than as a subtotal.
 */
export interface ExpenseCategoryDto {
  id: string;
  name: string;
  parentId: string | null;
  spent: number;
  children: ExpenseCategoryDto[];
}

export interface CreateExpenseCategoryDto {
  name: string;
  /** Omit for a top-level category; set to nest one level under it. */
  parentId?: string;
}

/** One line in the company's outgoing-money ledger. */
export interface ExpenseDto {
  id: string;
  expenseDate: string; // ISO 8601
  categoryId: string;
  /** The heading as shown, e.g. "Cleaning" or "Cleaning → Sanitiser". */
  categoryName: string;
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
  byCategory: { categoryId: string; categoryName: string; amount: number }[];
}
