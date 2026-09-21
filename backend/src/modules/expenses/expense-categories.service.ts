import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ExpenseCategoryDto } from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';

/**
 * The headings a business files its spending under, owned by the admin rather than by a migration.
 *
 * One level of nesting: a category may have subcategories, and a subcategory may not. That is what
 * the screen shows, and a deeper tree is a filing system nobody keeps up.
 *
 * Nothing in use is ever deleted. An expense already filed under a heading is a record of where
 * money went, so the heading has to keep existing for that record to mean anything.
 */
@Injectable()
export class ExpenseCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every category with its subcategories, each carrying what has been spent under it. */
  async list(): Promise<ExpenseCategoryDto[]> {
    const [categories, totals] = await Promise.all([
      this.prisma.expenseCategory.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.expense.groupBy({
        by: ['categoryId'],
        _sum: { amount: true },
      }),
    ]);
    const spentById = new Map(
      totals.map((row) => [row.categoryId, row._sum.amount ?? 0]),
    );

    const toDto = (
      category: (typeof categories)[number],
    ): ExpenseCategoryDto => {
      const children = categories
        .filter((c) => c.parentId === category.id)
        .map(toDto);
      const own = spentById.get(category.id) ?? 0;
      return {
        id: category.id,
        name: category.name,
        parentId: category.parentId,
        // A parent's figure includes its subcategories: "Cleaning ₹0" while a subcategory under it
        // holds ₹4,000 would be read as a bug, not as a subtotal.
        spent: round2(own + children.reduce((sum, c) => sum + c.spent, 0)),
        children,
      };
    };

    return categories.filter((c) => c.parentId === null).map(toDto);
  }

  async create(name: string, parentId?: string): Promise<ExpenseCategoryDto> {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Give the category a name');

    if (parentId) {
      const parent = await this.findOrThrow(parentId);
      // One level only: allowing a subcategory of a subcategory makes the picker a tree, and the
      // screen that shows them has exactly two levels of indentation.
      if (parent.parentId) {
        throw new BadRequestException(
          'A subcategory cannot have subcategories of its own',
        );
      }
    }

    await this.assertNameFree(trimmed, parentId ?? null);
    const created = await this.prisma.expenseCategory.create({
      data: { name: trimmed, parentId: parentId ?? null },
    });
    return { ...created, spent: 0, children: [] };
  }

  async rename(id: string, name: string): Promise<ExpenseCategoryDto> {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Give the category a name');
    const existing = await this.findOrThrow(id);
    await this.assertNameFree(trimmed, existing.parentId, id);

    const updated = await this.prisma.expenseCategory.update({
      where: { id },
      data: { name: trimmed },
    });
    return { ...updated, spent: 0, children: [] };
  }

  /** Refused while anything is filed under it, or under one of its subcategories. */
  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    const [used, children] = await Promise.all([
      this.prisma.expense.count({ where: { categoryId: id } }),
      this.prisma.expenseCategory.findMany({
        where: { parentId: id },
        select: { id: true },
      }),
    ]);
    if (used > 0) {
      throw new ConflictException(
        `This category is used by ${used} expense${used === 1 ? '' : 's'} and cannot be deleted. Rename it instead, or move those expenses first.`,
      );
    }
    if (children.length > 0) {
      const usedByChildren = await this.prisma.expense.count({
        where: { categoryId: { in: children.map((c) => c.id) } },
      });
      if (usedByChildren > 0) {
        throw new ConflictException(
          'A subcategory of this category is in use, so it cannot be deleted.',
        );
      }
      // Empty subcategories go with their parent; leaving them behind would orphan them into
      // top-level categories nobody asked for.
      await this.prisma.expenseCategory.deleteMany({ where: { parentId: id } });
    }
    await this.prisma.expenseCategory.delete({ where: { id } });
  }

  private async findOrThrow(id: string) {
    const category = await this.prisma.expenseCategory.findUnique({
      where: { id },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  // Case-insensitive, and scoped to the level it sits at: "Fuel" may exist once at the top and
  // once under "Vehicles" without either being a duplicate of the other.
  private async assertNameFree(
    name: string,
    parentId: string | null,
    exceptId?: string,
  ): Promise<void> {
    const clash = await this.prisma.expenseCategory.findFirst({
      where: {
        parentId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        parentId
          ? 'That subcategory already exists here'
          : 'That category already exists',
      );
    }
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
