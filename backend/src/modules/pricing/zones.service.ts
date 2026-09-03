import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { AssignZoneCountryDto } from './dto/assign-zone-country.dto';

const withDetails = {
  include: { rateProvider: true, _count: { select: { countries: true } } },
};
export type ZoneWithDetails = Prisma.ZoneGetPayload<typeof withDetails>;

const withCountryName = { include: { country: true } };
export type ZoneCountryWithName = Prisma.ZoneCountryGetPayload<
  typeof withCountryName
>;

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForProvider(rateProviderId: string): Promise<ZoneWithDetails[]> {
    return this.prisma.zone.findMany({
      where: { rateProviderId },
      orderBy: { name: 'asc' },
      ...withDetails,
    });
  }

  findOne(id: string): Promise<ZoneWithDetails> {
    return this.findOneOrThrow(id);
  }

  findCountries(zoneId: string): Promise<ZoneCountryWithName[]> {
    return this.prisma.zoneCountry.findMany({
      where: { zoneId },
      orderBy: { country: { name: 'asc' } },
      ...withCountryName,
    });
  }

  async create(dto: CreateZoneDto): Promise<ZoneWithDetails> {
    const existing = await this.prisma.zone.findUnique({
      where: {
        rateProviderId_name: {
          rateProviderId: dto.rateProviderId,
          name: dto.name,
        },
      },
    });
    if (existing) {
      throw new BadRequestException(
        `A zone named "${dto.name}" already exists for this provider`,
      );
    }
    const zone = await this.prisma.zone.create({
      data: { rateProviderId: dto.rateProviderId, name: dto.name },
    });
    return this.findOneOrThrow(zone.id);
  }

  async update(id: string, dto: UpdateZoneDto): Promise<ZoneWithDetails> {
    const existing = await this.findOneOrThrow(id);
    const clash = await this.prisma.zone.findUnique({
      where: {
        rateProviderId_name: {
          rateProviderId: existing.rateProviderId,
          name: dto.name,
        },
      },
    });
    if (clash && clash.id !== id) {
      throw new BadRequestException(
        `A zone named "${dto.name}" already exists for this provider`,
      );
    }
    await this.prisma.zone.update({ where: { id }, data: { name: dto.name } });
    return this.findOneOrThrow(id);
  }

  // Atomic upsert on (rateProviderId, countryId) — a country belongs to at most one zone per
  // provider (DB-enforced by ZoneCountry's unique index). A find-then-write here would reopen
  // the exact TOCTOU race the RateCard grouping-key upsert was built to avoid: two concurrent
  // first-ever assignments of the same country under a provider could both miss a lookup and
  // both attempt create.
  async assignCountry(
    zoneId: string,
    dto: AssignZoneCountryDto,
  ): Promise<void> {
    const zone = await this.findOneOrThrow(zoneId);
    await this.prisma.zoneCountry.upsert({
      where: {
        rateProviderId_countryId: {
          rateProviderId: zone.rateProviderId,
          countryId: dto.countryId,
        },
      },
      update: { zoneId },
      create: {
        zoneId,
        countryId: dto.countryId,
        rateProviderId: zone.rateProviderId,
      },
    });
  }

  async unassignCountry(zoneId: string, countryId: string): Promise<void> {
    await this.prisma.zoneCountry.deleteMany({ where: { zoneId, countryId } });
  }

  private async findOneOrThrow(id: string): Promise<ZoneWithDetails> {
    const zone = await this.prisma.zone.findUnique({
      where: { id },
      ...withDetails,
    });
    if (!zone) {
      throw new NotFoundException(`Zone ${id} not found`);
    }
    return zone;
  }
}
