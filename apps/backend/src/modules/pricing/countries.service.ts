import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Country } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';

@Injectable()
export class CountriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAllActive(): Promise<Country[]> {
    return this.prisma.country.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  findAll(): Promise<Country[]> {
    return this.prisma.country.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateCountryDto): Promise<Country> {
    await this.assertNameNotTaken(dto.name);
    const existingCode = await this.prisma.country.findUnique({ where: { code: dto.code } });
    if (existingCode) {
      throw new BadRequestException(`A country with code ${dto.code} already exists`);
    }
    return this.prisma.country.create({ data: dto });
  }

  async update(id: string, dto: UpdateCountryDto): Promise<Country> {
    await this.findOneOrThrow(id);
    if (dto.name) {
      await this.assertNameNotTaken(dto.name, id);
    }
    return this.prisma.country.update({ where: { id }, data: dto });
  }

  private async findOneOrThrow(id: string): Promise<Country> {
    const country = await this.prisma.country.findUnique({ where: { id } });
    if (!country) {
      throw new NotFoundException(`Country ${id} not found`);
    }
    return country;
  }

  // Case-insensitive match — "India" and "india" must never both exist, since the pricing
  // engine resolves a quote's destination country by a case-insensitive name lookup and would
  // otherwise pick one arbitrarily (Section: Country matching).
  private async assertNameNotTaken(name: string, excludeId?: string): Promise<void> {
    const clash = await this.prisma.country.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (clash) {
      throw new BadRequestException(`A country named "${clash.name}" already exists`);
    }
  }
}
