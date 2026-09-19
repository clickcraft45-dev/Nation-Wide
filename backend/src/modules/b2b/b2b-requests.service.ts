import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { B2bRequest, PartnerApplicationStatus } from '@prisma/client';
import type { B2bLinkDto } from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { publicFrontendUrl } from '../../common/config/public-urls';
import { MailService } from '../mail/mail.service';
import { b2bRequestReceived } from '../mail/mail.templates';
import { CustomersService } from '../customers/customers.service';
import { B2bLinksService } from './b2b-links.service';
import { CreateB2bRequestDto } from './dto/create-b2b-request.dto';
import { ReviewB2bRequestDto } from './dto/review-b2b-request.dto';

/**
 * Businesses asking for an account from the public site, and staff turning those into real B2B
 * customers.
 *
 * A row here grants nothing: submitting is public, so approval is where the account and the order
 * link are actually minted — through the same CustomersService and B2bLinksService an admin uses
 * by hand, never a second copy of that logic.
 */
@Injectable()
export class B2bRequestsService {
  private readonly logger = new Logger(B2bRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly links: B2bLinksService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreateB2bRequestDto): Promise<B2bRequest> {
    const email = dto.email.toLowerCase();

    // One open request per business. Without this the public endpoint is a free row-insert for
    // anyone with a script, and the queue fills with duplicates of the same company. A rejected
    // applicant may ask again — only a PENDING one blocks.
    const pending = await this.prisma.b2bRequest.findFirst({
      where: { status: 'PENDING', OR: [{ email }, { phone: dto.phone }] },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException(
        'We already have a request from this email or phone number — our team will be in touch shortly.',
      );
    }

    const request = await this.prisma.b2bRequest.create({
      data: {
        companyName: dto.companyName.trim(),
        contactName: dto.contactName.trim(),
        email,
        phone: dto.phone,
        monthlyVolume: dto.monthlyVolume?.trim() || null,
        message: dto.message?.trim() || null,
      },
    });

    // Alert ops, but never at the applicant's expense: the row is already committed, and
    // MailService.send resolves false rather than throwing, so a mail outage cannot turn a
    // successful request into an error page.
    await this.mail.send(
      b2bRequestReceived(
        {
          companyName: request.companyName,
          contactName: request.contactName,
          email: request.email,
          phone: request.phone,
          monthlyVolume: request.monthlyVolume,
          message: request.message,
          reviewUrl: `${publicFrontendUrl(this.config)}/admin/b2b-requests`,
        },
        this.mail.operationsInbox,
      ),
    );

    return request;
  }

  findAll(status?: PartnerApplicationStatus): Promise<B2bRequest[]> {
    return this.prisma.b2bRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Approve: reuse the customer if this phone already belongs to one (a business that already
   * ships with us asking for portal access), otherwise create them, then issue the order link.
   *
   * The returned link carries its URL — the one and only sight of the token, which the admin
   * screen shows once for copying.
   */
  async approve(
    id: string,
    dto: ReviewB2bRequestDto,
    reviewerId: string,
  ): Promise<{ request: B2bRequest; link: B2bLinkDto }> {
    const request = await this.findPendingOrThrow(id);

    const existing = await this.prisma.customer.findFirst({
      where: { OR: [{ phone: request.phone }, { email: request.email }] },
      select: { id: true },
    });
    const customerId =
      existing?.id ??
      (
        await this.customers.create({
          name: request.companyName,
          phone: request.phone,
          email: request.email,
          consentSource: 'b2b_request',
        })
      ).id;

    const link = await this.links.create(
      customerId,
      request.companyName,
      reviewerId,
    );
    this.logger.log(
      `B2B request ${id} approved by ${reviewerId}; customer ${customerId}, link ${link.id}`,
    );

    const updated = await this.prisma.b2bRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedByAdminId: reviewerId,
        reviewedAt: new Date(),
        reviewNote: dto.reviewNote,
        createdCustomerId: customerId,
        createdB2bLinkId: link.id,
      },
    });
    return { request: updated, link };
  }

  async reject(
    id: string,
    dto: ReviewB2bRequestDto,
    reviewerId: string,
  ): Promise<B2bRequest> {
    await this.findPendingOrThrow(id);
    return this.prisma.b2bRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedByAdminId: reviewerId,
        reviewedAt: new Date(),
        reviewNote: dto.reviewNote,
      },
    });
  }

  /** Only a PENDING request can be reviewed — re-approving would issue a second link. */
  private async findPendingOrThrow(id: string): Promise<B2bRequest> {
    const request = await this.prisma.b2bRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('B2B request not found');
    if (request.status !== 'PENDING') {
      throw new ConflictException(
        `This request was already ${request.status.toLowerCase()}`,
      );
    }
    return request;
  }
}
