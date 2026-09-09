import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import type { AdminUser } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { pickupPartnerCredentials } from '../mail/mail.templates';
import { generatePassword } from '../mail/generated-password';
import { publicFrontendUrl } from '../../common/config/public-urls';
import { CreatePickupPartnerDto } from './dto/create-pickup-partner.dto';
import { UpdatePickupPartnerDto } from './dto/update-pickup-partner.dto';

const PASSWORD_HASH_ROUNDS = 10;

// There is no general AdminUser account-management endpoint anywhere in this codebase (STAFF/
// ADMIN rows are only ever created via the seed script) — this is a minimal, purpose-built one
// scoped to role: PICKUP_PARTNER only, required so field executives can actually be onboarded.
@Injectable()
export class PickupPartnersService {
  private readonly logger = new Logger(PickupPartnersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

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

    // Generated unless the caller insisted on one. Held in a local only long enough to hash it
    // and put it in the mail — it is never persisted in the clear and never logged.
    const password = dto.password ?? generatePassword();
    const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
    const partner = await this.prisma.adminUser.create({
      data: {
        email: dto.email,
        passwordHash,
        role: 'PICKUP_PARTNER',
        name: dto.name,
        phone: dto.phone,
      },
    });

    // After the row, and awaited so the caller can tell the admin whether it actually went out.
    // MailService.send resolves false rather than throwing, so a Brevo outage leaves a usable
    // account behind instead of rolling back an onboarding that already succeeded.
    const emailed = await this.mail.send(
      pickupPartnerCredentials({
        name: dto.name ?? dto.email,
        email: dto.email,
        password,
        loginUrl: `${publicFrontendUrl(this.config)}/admin/login`,
      }),
    );
    if (!emailed) {
      this.logger.warn(
        `Created pickup partner ${partner.id} but could not email their credentials — they will need a password reset.`,
      );
    }

    return partner;
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
