import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../database/storage.service';
import { categoryLabel } from './expense.mapper';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';

// The name as well as the address: "Sujith" is who a super admin is looking for when they ask
// who filed a payment, and an email is only a proxy for it.
const RECORDED_BY = {
  select: { id: true, email: true, name: true },
} as const;
const EXPENSE_INCLUDE = {
  recordedBy: RECORDED_BY,
  category: { include: { parent: { select: { name: true } } } },
} as const;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Attach (or replace) the vendor's own bill. The file goes to S3 and only its key is stored,
   * like every other document here.
   *
   * Replacing one leaves the old object in the bucket rather than deleting it: an expense is a
   * financial record, and a mis-click that swaps a receipt should not also destroy the previous
   * one. Storage is cheaper than an argument with an auditor.
   */
  async attachReceipt(
    id: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new NotFoundException('Expense not found');

    const extension = file.originalname.split('.').pop()?.toLowerCase();
    const key = `expenses/${id}/receipt-${Date.now()}${extension ? `.${extension}` : ''}`;
    await this.storage.put(key, file.buffer, file.mimetype);

    return this.prisma.expense.update({
      where: { id },
      data: { receiptKey: key, receiptName: file.originalname.slice(0, 200) },
      include: EXPENSE_INCLUDE,
    });
  }

  /** A short-lived link to the stored bill, for an admin who has already been authorised. */
  async receiptUrl(id: string): Promise<string> {
    const expense = await this.prisma.expense.findUnique({ where: { id } });
    if (!expense?.receiptKey) {
      throw new NotFoundException('This expense has no receipt attached');
    }
    return this.storage.presignGet(
      expense.receiptKey,
      300,
      expense.receiptName ?? undefined,
    );
  }

  /**
   * One round trip for the whole screen: the page of rows, the row count, and the totals.
   *
   * The totals are computed over the FILTER, not over the page — an admin looking at page 2 of
   * September still needs September's total, not the sum of the twenty rows in front of them.
   */
  async list(filters: QueryExpensesDto) {
    const where: Prisma.ExpenseWhereInput = {};
    // Filtering by a parent takes its subcategories with it: nobody picking "Cleaning"
    // means "Cleaning but not the things filed under it".
    if (filters.categoryId) {
      where.OR = [
        { categoryId: filters.categoryId },
        { category: { parentId: filters.categoryId } },
      ];
    }
    if (filters.from || filters.to) {
      where.expenseDate = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }
    if (filters.search) {
      const contains = filters.search;
      // AND, not another OR: a search inside a category filter must narrow it, not widen it back
      // out to every expense matching the text.
      where.AND = [
        {
          OR: [
            { paidTo: { contains, mode: 'insensitive' } },
            { description: { contains, mode: 'insensitive' } },
            { referenceNo: { contains, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [items, aggregate, grouped] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: { expenseDate: 'desc' },
        skip: filters.skip ?? 0,
        take: filters.take ?? 50,
        include: {
          recordedBy: RECORDED_BY,
          category: { include: { parent: { select: { name: true } } } },
        },
      }),
      this.prisma.expense.aggregate({
        where,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.expense.groupBy({
        by: ['categoryId'],
        where,
        _sum: { amount: true },
      }),
    ]);

    // One lookup for the headings the grouped totals refer to — groupBy returns ids, and a
    // dashboard showing uuids is no dashboard.
    const categories = await this.prisma.expenseCategory.findMany({
      where: { id: { in: grouped.map((row) => row.categoryId) } },
      include: { parent: { select: { name: true } } },
    });
    const categoryById = new Map(categories.map((c) => [c.id, c]));

    return {
      items,
      total: aggregate._count,
      totalAmount: aggregate._sum.amount ?? 0,
      byCategory: grouped
        .map((row) => ({
          categoryId: row.categoryId,
          categoryName: categoryLabel(categoryById.get(row.categoryId)),
          amount: row._sum.amount ?? 0,
        }))
        .sort((a, b) => b.amount - a.amount),
    };
  }

  create(dto: CreateExpenseDto, adminId: string) {
    return this.prisma.expense.create({
      data: { ...dto, recordedByAdminId: adminId },
      include: {
        recordedBy: RECORDED_BY,
        category: { include: { parent: { select: { name: true } } } },
      },
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
