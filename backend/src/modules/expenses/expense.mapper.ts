import type { Expense } from '@prisma/client';
import type { ExpenseDto, PaymentMethodCode } from '@nationwide/shared-types';

type ExpenseWithRelations = Expense & {
  recordedBy?: { id: string; email: string } | null;
  category?: { name: string; parent?: { name: string } | null } | null;
};

/** "Cleaning → Sanitiser" for a subcategory, so a row says where it sits without a second lookup. */
export function categoryLabel(
  category?: { name: string; parent?: { name: string } | null } | null,
): string {
  if (!category) return 'Uncategorised';
  return category.parent
    ? `${category.parent.name} → ${category.name}`
    : category.name;
}

export function toExpenseDto(expense: ExpenseWithRelations): ExpenseDto {
  return {
    id: expense.id,
    expenseDate: expense.expenseDate.toISOString(),
    categoryId: expense.categoryId,
    categoryName: categoryLabel(expense.category),
    amount: expense.amount,
    currency: expense.currency,
    paymentMethod: expense.paymentMethod as PaymentMethodCode,
    paidTo: expense.paidTo,
    description: expense.description,
    referenceNo: expense.referenceNo,
    recordedBy: expense.recordedBy ?? null,
    createdAt: expense.createdAt.toISOString(),
  };
}
