import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PICKUP_TIME_SLOTS,
  type QuoteReviewReasonCode,
  type QuoteStatusCode,
} from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TEMPLATES } from '../notifications/templates';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { ManualQuoteDto } from './dto/manual-quote.dto';
import { RejectQuoteDto } from './dto/reject-quote.dto';
import { QueryQuotesDto } from './dto/query-quotes.dto';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const PICKUP_WINDOW_DAYS = 7;
// No real weight-based pricing exists yet — this is a conservative placeholder threshold for
// flagging a quote as needing manual review, not a rate calculation. See classifyShipment.
const OVERSIZED_WEIGHT_KG = 50;

const withCustomer = {
  include: {
    customer: { select: { name: true, email: true, phone: true } },
    quotedBy: { select: { email: true } },
  },
};
export type QuoteWithCustomer = Prisma.QuoteGetPayload<typeof withCustomer>;

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    dto: CreateQuoteDto,
    customerId: string,
  ): Promise<QuoteWithCustomer> {
    if (dto.fulfillmentMethod === 'PICKUP') {
      this.assertValidPickupWindow(dto.pickupDate, dto.pickupTimeSlot);
    } else if (dto.pickupDate || dto.pickupTimeSlot) {
      throw new BadRequestException(
        'pickupDate/pickupTimeSlot must not be set for WAREHOUSE_DROP_OFF',
      );
    }

    const { status, reviewReason } = this.classifyShipment(dto);

    try {
      const quote = await this.prisma.quote.create({
        data: {
          customerId,
          shipmentType: dto.shipmentType,
          weightKg: dto.weightKg,
          description: dto.description ?? null,
          originName: dto.origin.name,
          originPhone: dto.origin.phone,
          originAddressLine1: dto.origin.addressLine1,
          originAddressLine2: dto.origin.addressLine2 ?? null,
          originCity: dto.origin.city,
          originState: dto.origin.state,
          originPostalCode: dto.origin.postalCode,
          originCountry: dto.origin.country,
          originInstructions: dto.origin.instructions ?? null,
          destName: dto.destination.name,
          destPhone: dto.destination.phone,
          destAddressLine1: dto.destination.addressLine1,
          destAddressLine2: dto.destination.addressLine2 ?? null,
          destCity: dto.destination.city,
          destState: dto.destination.state,
          destPostalCode: dto.destination.postalCode,
          destCountry: dto.destination.country,
          fulfillmentMethod: dto.fulfillmentMethod,
          pickupDate: dto.pickupDate ? new Date(dto.pickupDate) : null,
          pickupTimeSlot: dto.pickupTimeSlot ?? null,
          status,
          reviewReason,
          submissionKey: dto.submissionKey,
        },
        ...withCustomer,
      });
      return quote;
    } catch (error) {
      // Duplicate submit (double-click, refresh mid-submit, retried request) — return the
      // already-created row instead of erroring, so the client converges idempotently.
      const isSubmissionKeyCollision =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION &&
        (error.meta?.target as string[] | undefined)?.includes(
          'submission_key',
        );
      if (isSubmissionKeyCollision) {
        const existing = await this.prisma.quote.findUnique({
          where: { submissionKey: dto.submissionKey },
          ...withCustomer,
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  findAllForCustomer(customerId: string): Promise<QuoteWithCustomer[]> {
    return this.prisma.quote.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      ...withCustomer,
    });
  }

  async acceptQuote(
    id: string,
    customerId: string,
  ): Promise<QuoteWithCustomer> {
    const quote = await this.findOneOrThrow(id);
    if (quote.customerId !== customerId) {
      throw new ForbiddenException('This quote does not belong to you');
    }
    if (quote.status !== 'QUOTED') {
      throw new BadRequestException(
        `Quote must be QUOTED to accept (current status: ${quote.status})`,
      );
    }

    const { order } = await this.ordersService.createOrderWithShipment(
      customerId,
    );

    await this.prisma.pickup.create({
      data: {
        quoteId: quote.id,
        orderId: order.id,
        method: quote.fulfillmentMethod,
        scheduledDate: quote.pickupDate,
        scheduledTimeSlot: quote.pickupTimeSlot,
      },
    });

    await this.prisma.quote.update({
      where: { id: quote.id },
      data: { orderId: order.id, status: 'ACCEPTED' },
    });

    return this.findOneOrThrow(id);
  }

  findAllAdmin(query: QueryQuotesDto): Promise<QuoteWithCustomer[]> {
    const where: Prisma.QuoteWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.customer = {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }
    return this.prisma.quote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...withCustomer,
    });
  }

  findOneAdmin(id: string): Promise<QuoteWithCustomer> {
    return this.findOneOrThrow(id);
  }

  async setManualQuote(
    id: string,
    dto: ManualQuoteDto,
    actorId: string,
  ): Promise<QuoteWithCustomer> {
    const quote = await this.findOneOrThrow(id);
    if (quote.status === 'ACCEPTED' || quote.status === 'REJECTED') {
      throw new BadRequestException(
        `Cannot quote a request that is already ${quote.status}`,
      );
    }

    await this.prisma.quote.update({
      where: { id },
      data: {
        quotedAmount: dto.amount,
        quotedCurrency: dto.currency ?? 'INR',
        quotedByAdminId: actorId,
        quotedAt: new Date(),
        internalNotes: dto.internalNotes ?? quote.internalNotes,
        status: 'QUOTED',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'MANUAL_QUOTE_CREATED',
        entity: 'Quote',
        entityId: id,
        before: { status: quote.status, quotedAmount: null },
        after: { status: 'QUOTED', quotedAmount: dto.amount },
      },
    });

    await this.notificationsService.enqueue(
      quote.customerId,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.QUOTE_READY,
      { amount: String(dto.amount) },
    );

    return this.findOneOrThrow(id);
  }

  async reject(
    id: string,
    dto: RejectQuoteDto,
    actorId: string,
  ): Promise<QuoteWithCustomer> {
    const quote = await this.findOneOrThrow(id);
    if (quote.status === 'ACCEPTED' || quote.status === 'REJECTED') {
      throw new BadRequestException(
        `Cannot reject a request that is already ${quote.status}`,
      );
    }

    await this.prisma.quote.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: dto.reason },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'QUOTE_REJECTED',
        entity: 'Quote',
        entityId: id,
        before: { status: quote.status },
        after: { status: 'REJECTED', reason: dto.reason },
      },
    });

    await this.notificationsService.enqueue(
      quote.customerId,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.QUOTE_REJECTED,
      { reason: dto.reason },
    );

    return this.findOneOrThrow(id);
  }

  private async findOneOrThrow(id: string): Promise<QuoteWithCustomer> {
    const quote = await this.prisma.quote.findUnique({
      where: { id },
      ...withCustomer,
    });
    if (!quote) {
      throw new NotFoundException(`Quote ${id} not found`);
    }
    return quote;
  }

  private assertValidPickupWindow(
    pickupDate?: string,
    pickupTimeSlot?: string,
  ): void {
    if (!pickupDate || !pickupTimeSlot) {
      throw new BadRequestException(
        'pickupDate and pickupTimeSlot are required for PICKUP',
      );
    }
    if (!(PICKUP_TIME_SLOTS as readonly string[]).includes(pickupTimeSlot)) {
      throw new BadRequestException(`Invalid pickupTimeSlot: ${pickupTimeSlot}`);
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const maxDate = new Date(today);
    maxDate.setUTCDate(maxDate.getUTCDate() + PICKUP_WINDOW_DAYS);

    const requested = new Date(`${pickupDate}T00:00:00.000Z`);
    if (Number.isNaN(requested.getTime())) {
      throw new BadRequestException(`Invalid pickupDate: ${pickupDate}`);
    }
    if (requested < today || requested > maxDate) {
      throw new BadRequestException(
        `pickupDate must be within the next ${PICKUP_WINDOW_DAYS} days`,
      );
    }
  }

  // Deliberately conservative placeholder for a real rules/pricing engine (Section: Quote
  // lifecycle) — flags only what's unambiguous from shipmentType/weight. No pricing logic, no
  // dangerous-goods keyword scanning; every quote still needs a staff-entered price regardless.
  private classifyShipment(dto: CreateQuoteDto): {
    status: QuoteStatusCode;
    reviewReason: QuoteReviewReasonCode | null;
  } {
    if (dto.shipmentType === 'OTHER') {
      return { status: 'NEEDS_MANUAL_REVIEW', reviewReason: 'MISCELLANEOUS' };
    }
    if (dto.weightKg > OVERSIZED_WEIGHT_KG) {
      return { status: 'NEEDS_MANUAL_REVIEW', reviewReason: 'OVERSIZED' };
    }
    return { status: 'SUBMITTED', reviewReason: null };
  }
}
