import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Announcement } from '@prisma/client';
import type {
  AnnouncementDto,
  AnnouncementKind,
  SaveAnnouncementDto,
} from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';

export function toAnnouncementDto(a: Announcement): AnnouncementDto {
  return {
    id: a.id,
    kind: a.kind,
    title: a.title,
    slug: a.slug,
    summary: a.summary,
    body: a.body,
    location: a.location,
    startsAt: a.startsAt?.toISOString() ?? null,
    endsAt: a.endsAt?.toISOString() ?? null,
    couponCode: a.couponCode,
    isPublished: a.isPublished,
    showBanner: a.showBanner,
    updatedAt: a.updatedAt.toISOString(),
  };
}

/** "Diwali Sale 2026!" -> "diwali-sale-2026". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Started (or no start) and not ended (or no end). */
function liveWhere(now: Date): Prisma.AnnouncementWhereInput {
  return {
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    ],
  };
}

/**
 * Events and sale offers for the public site. Nothing else references a row, so delete is real.
 */
@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AnnouncementDto[]> {
    const rows = await this.prisma.announcement.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(toAnnouncementDto);
  }

  /**
   * What the public pages show. Offers only while they run, since an ended sale is a promise the
   * site can no longer keep. Events stay up after they happen, as the "Past" list.
   */
  async published(kind: AnnouncementKind): Promise<AnnouncementDto[]> {
    const rows = await this.prisma.announcement.findMany({
      where: {
        kind,
        isPublished: true,
        ...(kind === 'OFFER' ? liveWhere(new Date()) : {}),
      },
      orderBy: [{ startsAt: { sort: 'desc', nulls: 'first' } }],
      take: 100,
    });
    return rows.map(toAnnouncementDto);
  }

  async bySlug(slug: string): Promise<AnnouncementDto> {
    const row = await this.prisma.announcement.findFirst({
      where: { slug, isPublished: true },
    });
    if (!row) throw new NotFoundException('Not found');
    return toAnnouncementDto(row);
  }

  /** The one strip across the top of the site: the most recently edited live banner. */
  async banner(): Promise<AnnouncementDto | null> {
    const row = await this.prisma.announcement.findFirst({
      where: { isPublished: true, showBanner: true, ...liveWhere(new Date()) },
      orderBy: { updatedAt: 'desc' },
    });
    return row ? toAnnouncementDto(row) : null;
  }

  create(input: SaveAnnouncementDto): Promise<AnnouncementDto> {
    return this.write(() =>
      this.prisma.announcement.create({ data: toData(input) }),
    );
  }

  async update(
    id: string,
    input: SaveAnnouncementDto,
  ): Promise<AnnouncementDto> {
    await this.exists(id);
    return this.write(() =>
      this.prisma.announcement.update({ where: { id }, data: toData(input) }),
    );
  }

  /** Just the two toggles, so flipping one never resends (and risks clobbering) the text. */
  async setFlags(
    id: string,
    flags: { isPublished?: boolean; showBanner?: boolean },
  ): Promise<AnnouncementDto> {
    await this.exists(id);
    const row = await this.prisma.announcement.update({
      where: { id },
      data: flags,
    });
    return toAnnouncementDto(row);
  }

  async remove(id: string): Promise<void> {
    await this.exists(id);
    await this.prisma.announcement.delete({ where: { id } });
  }

  private async exists(id: string): Promise<void> {
    const row = await this.prisma.announcement.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Event or offer not found');
  }

  private async write(
    run: () => Promise<Announcement>,
  ): Promise<AnnouncementDto> {
    try {
      return toAnnouncementDto(await run());
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Another event or offer already uses that link. Change the title or the link.',
        );
      }
      throw error;
    }
  }
}

function toData(input: SaveAnnouncementDto) {
  const text = (v?: string | null) => v?.trim() || null;
  return {
    kind: input.kind,
    title: input.title.trim(),
    slug: slugify(input.slug?.trim() || input.title),
    summary: input.summary.trim(),
    body: text(input.body),
    location: text(input.location),
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    couponCode: text(input.couponCode)?.toUpperCase() ?? null,
    isPublished: input.isPublished ?? false,
    showBanner: input.showBanner ?? false,
  };
}
