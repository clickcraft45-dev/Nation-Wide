import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type ExpenseCategory } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';

const RECORDED_BY = { select: { id: true, email: true } } as const;

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One round trip for the whole screen: the page of rows, the row count, and the totals.
   *
   * The totals are computed over the FILTER, not over the page — an admin looking at page 2 of
   * September still needs September's total, not the sum of the twenty rows in front of them.
   */
  async list(filters: QueryExpensesDto) {
    const where: Prisma.ExpenseWhereInput = {};
    if (filters.category) where.category = filters.category;
    if (filters.from || filters.to) {
      where.expenseDate = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }
    if (filters.search) {
      const contains = filters.search;
      where.OR = [
        { paidTo: { contains, mode: 'insensitive' } },
        { description: { contains, mode: 'insensitive' } },
        { referenceNo: { contains, mode: 'insensitive' } },
      ];
    }

    const [items, aggregate, grouped] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: { expenseDate: 'desc' },
        skip: filters.skip ?? 0,
        take: filters.take ?? 50,
        include: { recordedBy: RECORDED_BY },
      }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true }, _count: true }),
      this.prisma.expense.groupBy({
        by: ['category'],
        where,
        _sum: { amount: true },
      }),
    ]);

    return {
      items,
      total: aggregate._count,
      totalAmount: aggregate._sum.amount ?? 0,
      byCategory: grouped
        .map((row: { category: ExpenseCategory; _sum: { amount: number | null } }) => ({
          category: row.category,
          amount: row._sum.amount ?? 0,
        }))
        .sort((a, b) => b.amount - a.amount),
    };
  }

  create(dto: CreateExpenseDto, adminId: string) {
    return this.prisma.expense.create({
      data: { ...dto, recordedByAdminId: adminId },
      include: { recordedBy: RECORDED_BY },
    });
  }

  async update(id: string, dto: CreateExpenseDto) {
    await this.get(id);
    return this.prisma.expense.update({
      where: { id },
      data: dto,
      include: { recordedBy: RECORDED_BY },
    });
  }

  async remove(id: string): Promise<void> {
    await this.get(id);
    await this.prisma.expense.delete({ where: { id } });
  }

  private async get(id: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }
}
