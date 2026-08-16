import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { AdminUser } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreatePickupPartnerDto } from './dto/create-pickup-partner.dto';
import { UpdatePickupPartnerDto } from './dto/update-pickup-partner.dto';

const PASSWORD_HASH_ROUNDS = 10;

// There is no general AdminUser account-management endpoint anywhere in this codebase (STAFF/
// ADMIN rows are only ever created via the seed script) — this is a minimal, purpose-built one
// scoped to role: PICKUP_PARTNER only, required so field executives can actually be onboarded.
@Injectable()
export class PickupPartnersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<AdminUser[]> {
    return this.prisma.adminUser.findMany({
      where: { role: 'PICKUP_PARTNER' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreatePickupPartnerDto): Promise<AdminUser> {
    const existing = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new BadRequestException(
        `An account with email ${dto.email} already exists`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_HASH_ROUNDS);
    return this.prisma.adminUser.create({
      data: {
        email: dto.email,
        passwordHash,
        role: 'PICKUP_PARTNER',
        name: dto.name,
        phone: dto.phone,
      },
    });
  }

  async update(id: string, dto: UpdatePickupPartnerDto): Promise<AdminUser> {
    await this.findOneOrThrow(id);
    return this.prisma.adminUser.update({
      where: { id },
      data: dto,
    });
  }

  private async findOneOrThrow(id: string): Promise<AdminUser> {
    const partner = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!partner || partner.role !== 'PICKUP_PARTNER') {
      throw new NotFoundException(`Pickup partner ${id} not found`);
    }
    return partner;
  }
}
