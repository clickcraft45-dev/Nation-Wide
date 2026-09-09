import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  PartnerApplication,
  PartnerApplicationStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { publicFrontendUrl } from '../../common/config/public-urls';
import { MailService } from '../mail/mail.service';
import { partnerApplicationReceived } from '../mail/mail.templates';
import { PickupPartnersService } from '../admin/pickup-partners.service';
import { CreatePartnerApplicationDto } from './dto/create-partner-application.dto';
import {
  ApprovePartnerApplicationDto,
  RejectPartnerApplicationDto,
} from './dto/review-partner-application.dto';

@Injectable()
export class PartnerApplicationsService {
  private readonly logger = new Logger(PartnerApplicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Approval mints the account through the exact same path an admin uses by hand, rather than
    // a second adminUser.create() that could drift from it on role or hash rounds.
    private readonly pickupPartners: PickupPartnersService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // ponytail: create() and CreatePartnerApplicationDto are now unreachable — the public
  // controller that called them is gone. Kept, with its tests, because reviewing and approving
  // applications submitted before the change still works and re-opening public applications is
  // a one-file change. Delete both, and partnerApplicationReceived in mail.templates.ts, once
  // the last PENDING row is closed out.
  async create(dto: CreatePartnerApplicationDto): Promise<PartnerApplication> {
    const email = dto.email.toLowerCase();

    // One open application per person. Without this the public endpoint is a free row-insert for
    // anyone with a script, and the review queue fills with duplicates of the same applicant.
    // A rejected applicant may re-apply — only a PENDING one blocks.
    const pending = await this.prisma.partnerApplication.findFirst({
      where: { status: 'PENDING', OR: [{ email }, { phone: dto.phone }] },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException(
        'An application with this email or phone number is already awaiting review',
      );
    }

    // Deliberately the same generic answer whether the clash is an existing partner or an
    // existing customer — this endpoint is unauthenticated, and a distinct message would let
    // anyone test whether a given address has an account here.
    const existingAccount = await this.prisma.adminUser.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingAccount) {
      throw new ConflictException(
        'An application with this email or phone number is already awaiting review',
      );
    }

    const application = await this.prisma.partnerApplication.create({
      data: {
        name: dto.name,
        email,
        phone: dto.phone,
        serviceArea: dto.serviceArea,
        note: dto.note,
      },
    });

    // Alert ops, but never at the applicant's expense: the row is already committed, and
    // MailService.send resolves false rather than throwing, so a Brevo outage cannot turn a
    // successful application into an error page.
    const frontendUrl = publicFrontendUrl(this.config);
    await this.mail.send(
      partnerApplicationReceived(
        {
          name: application.name,
          email: application.email,
          phone: application.phone,
          serviceArea: application.serviceArea,
          note: application.note,
          reviewUrl: `${frontendUrl}/admin/partner-applications`,
        },
        this.mail.operationsInbox,
      ),
    );

    return application;
  }

  findAll(status?: PartnerApplicationStatus): Promise<PartnerApplication[]> {
    return this.prisma.partnerApplication.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async approve(
    id: string,
    dto: ApprovePartnerApplicationDto,
    reviewerId: string,
  ): Promise<PartnerApplication> {
    const application = await this.findPendingOrThrow(id);

    // No password argument: PickupPartnersService generates one and emails it to the applicant,
    // so approving is now a single click and the credential never passes through an admin.
    const partner = await this.pickupPartners.create({
      email: application.email,
      name: application.name,
      phone: application.phone,
    });

    this.logger.log(
      `Partner application ${id} approved by ${reviewerId}; created AdminUser ${partner.id}`,
    );

    return this.prisma.partnerApplication.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedByAdminId: reviewerId,
        reviewedAt: new Date(),
        reviewNote: dto.reviewNote,
        createdAdminUserId: partner.id,
      },
    });
  }

  async reject(
    id: string,
    dto: RejectPartnerApplicationDto,
    reviewerId: string,
  ): Promise<PartnerApplication> {
    await this.findPendingOrThrow(id);
    return this.prisma.partnerApplication.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedByAdminId: reviewerId,
        reviewedAt: new Date(),
        reviewNote: dto.reviewNote,
      },
    });
  }

  /** Only a PENDING application can be reviewed — re-approving would mint a second account. */
  private async findPendingOrThrow(id: string): Promise<PartnerApplication> {
    const application = await this.prisma.partnerApplication.findUnique({
      where: { id },
    });
    if (!application) {
      throw new NotFoundException('Partner application not found');
    }
    if (application.status !== 'PENDING') {
      throw new ConflictException(
        `This application was already ${application.status.toLowerCase()}`,
      );
    }
    return application;
  }
}
