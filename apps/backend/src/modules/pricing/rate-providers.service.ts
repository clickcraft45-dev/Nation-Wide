import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { RateProvider } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateRateProviderDto } from './dto/create-rate-provider.dto';
import { UpdateRateProviderDto } from './dto/update-rate-provider.dto';

@Injectable()
export class RateProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<RateProvider[]> {
    return this.prisma.rateProvider.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateRateProviderDto): Promise<RateProvider> {
    const existing = await this.prisma.rateProvider.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new BadRequestException(`A rate provider with code ${dto.code} already exists`);
    }
    return this.prisma.rateProvider.create({ data: dto });
  }

  async update(id: string, dto: UpdateRateProviderDto): Promise<RateProvider> {
    await this.findOneOrThrow(id);
    return this.prisma.rateProvider.update({ where: { id }, data: dto });
  }

  private async findOneOrThrow(id: string): Promise<RateProvider> {
    const provider = await this.prisma.rateProvider.findUnique({ where: { id } });
    if (!provider) {
      throw new NotFoundException(`Rate provider ${id} not found`);
    }
    return provider;
  }
}
