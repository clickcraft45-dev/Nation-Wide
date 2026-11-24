import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ItemCatalogEntry } from '@prisma/client';
import type {
  ItemCatalogEntryDto,
  UnlistedItemDto,
} from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';

/** How far back the "typed but not in the list" suggestions look. */
const UNLISTED_LOOKBACK_DAYS = 90;
/** Quotes read for those suggestions; a ceiling, so the page stays quick as history grows. */
const UNLISTED_SCAN_LIMIT = 3000;

export interface SaveCatalogEntryInput {
  name: string;
  category?: string | null;
  hsCode?: string | null;
  defaultUnitValue?: number | null;
}

export function toCatalogDto(entry: ItemCatalogEntry): ItemCatalogEntryDto {
  return {
    id: entry.id,
    name: entry.name,
    category: entry.category,
    hsCode: entry.hsCode,
    defaultUnitValue: entry.defaultUnitValue,
  };
}

const key = (name: string) => name.trim().toLowerCase();

/**
 * The admin's list of recurring items. Anyone entering contents is offered these as they type;
 * an item not in the list is still accepted for that shipment, and shows up in unlisted() so the
 * admin can add it if it recurs. Nothing is added to the list behind the admin's back.
 */
@Injectable()
export class ItemCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<ItemCatalogEntry[]> {
    return this.prisma.itemCatalogEntry.findMany({ orderBy: { name: 'asc' } });
  }

  async create(input: SaveCatalogEntryInput): Promise<ItemCatalogEntry> {
    const name = input.name.trim();
    await this.assertNameFree(name);
    return this.prisma.itemCatalogEntry.create({
      data: { ...this.fields(input), name },
    });
  }

  async update(
    id: string,
    input: SaveCatalogEntryInput,
  ): Promise<ItemCatalogEntry> {
    const existing = await this.prisma.itemCatalogEntry.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`Item ${id} not found`);
    const name = input.name.trim();
    await this.assertNameFree(name, id);
    return this.prisma.itemCatalogEntry.update({
      where: { id },
      data: { ...this.fields(input), name },
    });
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.prisma.itemCatalogEntry.deleteMany({
      where: { id },
    });
    if (deleted.count === 0) {
      throw new NotFoundException(`Item ${id} not found`);
    }
  }

  /**
   * Items typed on recent shipments that are not in the list, most used first, each with the
   * kind of goods, HS code and value last given for it, so adding one is a single tap.
   */
  async unlisted(): Promise<UnlistedItemDto[]> {
    const since = new Date(
      Date.now() - UNLISTED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );
    const [entries, quotes] = await Promise.all([
      this.prisma.itemCatalogEntry.findMany({ select: { name: true } }),
      this.prisma.quote.findMany({
        where: { updatedAt: { gte: since } },
        select: { items: true },
        orderBy: { updatedAt: 'desc' },
        take: UNLISTED_SCAN_LIMIT,
      }),
    ]);
    const listed = new Set(entries.map((e) => key(e.name)));
    const found = new Map<string, UnlistedItemDto>();
    for (const quote of quotes) {
      if (!Array.isArray(quote.items)) continue;
      for (const raw of quote.items as Record<string, unknown>[]) {
        const name =
          typeof raw?.description === 'string' ? raw.description.trim() : '';
        if (!name || listed.has(key(name))) continue;
        const seen = found.get(key(name));
        if (seen) {
          seen.timesUsed += 1;
          continue;
        }
        // Newest first, so the first sighting carries the latest details.
        found.set(key(name), {
          name,
          category: typeof raw.category === 'string' ? raw.category : null,
          hsCode: typeof raw.hsCode === 'string' ? raw.hsCode : null,
          unitValue: typeof raw.unitValue === 'number' ? raw.unitValue : null,
          timesUsed: 1,
        });
      }
    }
    return [...found.values()]
      .sort((a, b) => b.timesUsed - a.timesUsed || a.name.localeCompare(b.name))
      .slice(0, 50);
  }

  private fields(input: SaveCatalogEntryInput) {
    return {
      category: input.category?.trim() || null,
      hsCode: input.hsCode?.trim() || null,
      defaultUnitValue: input.defaultUnitValue ?? null,
    };
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const clash = await this.prisma.itemCatalogEntry.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(`"${name}" is already in the list`);
    }
  }
}
