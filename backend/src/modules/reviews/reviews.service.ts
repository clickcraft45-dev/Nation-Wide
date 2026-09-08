import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { Review } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { publicFrontendUrl } from '../../common/config/public-urls';
import { MailService } from '../mail/mail.service';
import { feedbackRequest } from '../mail/mail.templates';
import { SubmitReviewDto } from './dto/submit-review.dto';

// Long enough that a customer who reads email weekly still gets to answer, short enough that a
// link found in an old inbox years later is inert.
const INVITE_TTL_DAYS = 30;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Called when a shipment reaches DELIVERED, from both paths that can put it there (the admin
   * override and the provider sync).
   *
   * Safe to call repeatedly and from either: the shipment's unique constraint means the second
   * call finds an existing row and does nothing, so a status that flaps or a re-sync cannot mail
   * the same customer twice.
   */
  async requestFeedback(shipmentId: string): Promise<void> {
    const existing = await this.prisma.review.findUnique({
      where: { shipmentId },
      select: { id: true },
    });
    if (existing) return;

    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { order: { include: { customer: true } } },
    });
    const customer = shipment?.order.customer;
    if (!shipment || !customer?.email) {
      // A staff-created customer may have no email. Nothing to invite, and not an error.
      return;
    }

    const token = randomBytes(32).toString('base64url');
    await this.prisma.review.create({
      data: {
        shipmentId,
        customerId: customer.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      },
    });

    const url = `${publicFrontendUrl(this.config)}/feedback/${token}`;
    // Fire-and-forget by design: MailService.send resolves false rather than throwing, and a
    // mail outage must not roll back a delivery that already happened.
    await this.mail.send(
      feedbackRequest(
        customer.email,
        customer.name,
        shipment.internalTrackingNumber,
        url,
      ),
    );
    this.logger.log(`Feedback invited for shipment ${shipmentId}`);
  }

  /** The invitation behind a link, for the page to render before anything is submitted. */
  async findByToken(token: string): Promise<{
    trackingNumber: string;
    customerName: string;
    alreadySubmitted: boolean;
  }> {
    const review = await this.prisma.review.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { shipment: true, customer: true },
    });
    if (!review || review.expiresAt < new Date()) {
      throw new NotFoundException(
        'This feedback link is invalid or has expired.',
      );
    }
    return {
      trackingNumber: review.shipment.internalTrackingNumber,
      customerName: review.customer.name,
      alreadySubmitted: review.submittedAt !== null,
    };
  }

  async submit(token: string, dto: SubmitReviewDto): Promise<void> {
    const review = await this.prisma.review.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!review || review.expiresAt < new Date()) {
      throw new NotFoundException(
        'This feedback link is invalid or has expired.',
      );
    }
    if (review.submittedAt) {
      // Not an error the customer caused, but editing a published review through a link that
      // may be sitting in a forwarded email is not something to allow silently.
      throw new BadRequestException(
        'Feedback has already been submitted for this shipment. Contact us if you need it changed.',
      );
    }

    await this.prisma.review.update({
      where: { id: review.id },
      data: {
        rating: dto.rating,
        comment: dto.comment?.trim() || null,
        submittedAt: new Date(),
        // Never auto-approved: nothing a stranger types reaches the homepage unread.
        approved: false,
      },
    });
  }

  /**
   * The public feed for the homepage. Only approved, only actually written, newest first —
   * an approved row with no comment is a rating with nothing to quote.
   */
  publishedReviews(limit = 20): Promise<Review[]> {
    return this.prisma.review.findMany({
      where: { approved: true, comment: { not: null } },
      orderBy: { submittedAt: 'desc' },
      take: limit,
      include: { customer: { select: { name: true } } },
    }) as unknown as Promise<Review[]>;
  }

  /** Admin moderation queue: everything submitted, approved or not. */
  submitted(): Promise<Review[]> {
    return this.prisma.review.findMany({
      where: { submittedAt: { not: null } },
      orderBy: { submittedAt: 'desc' },
      include: {
        customer: { select: { name: true } },
        shipment: { select: { internalTrackingNumber: true } },
      },
    }) as unknown as Promise<Review[]>;
  }

  async setApproved(
    id: string,
    approved: boolean,
    adminId: string,
  ): Promise<Review> {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review?.submittedAt) {
      throw new NotFoundException('No submitted review with that id.');
    }
    return this.prisma.review.update({
      where: { id },
      data: {
        approved,
        approvedByAdminId: approved ? adminId : null,
        approvedAt: approved ? new Date() : null,
      },
    });
  }
}
