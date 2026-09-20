import type { Expense } from '@prisma/client';
import type { ExpenseCategoryCode, ExpenseDto } from '@nationwide/shared-types';
import type { PaymentMethodCode } from '@nationwide/shared-types';

type ExpenseWithRecorder = Expense & {
  recordedBy?: { id: string; email: string } | null;
};

export function toExpenseDto(expense: ExpenseWithRecorder): ExpenseDto {
  return {
    id: expense.id,
    expenseDate: expense.expenseDate.toISOString(),
    category: expense.category as ExpenseCategoryCode,
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
