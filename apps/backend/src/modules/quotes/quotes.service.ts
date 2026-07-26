import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  PICKUP_TIME_SLOTS,
  type QuotePreviewResultDto,
  type QuoteReviewReasonCode,
  type QuoteStatusCode,
} from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TEMPLATES } from '../notifications/templates';
import {
  PricingEngineService,
  type ComputedRateOption,
} from '../pricing/pricing-engine.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { ManualQuoteDto } from './dto/manual-quote.dto';
import { RejectQuoteDto } from './dto/reject-quote.dto';
import { QueryQuotesDto } from './dto/query-quotes.dto';
import { QuotePreviewQueryDto } from './dto/quote-preview.dto';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const PICKUP_WINDOW_DAYS = 7;
// Matches the top of the real carrier tariffs' bracket coverage (DHL/UPS both price up to
// 99+kg) — above this, no rate card will ever exist, so there's no point calling the pricing
// engine at all. See classifyManualReview.
const OVERSIZED_WEIGHT_KG = 100;
const DEFAULT_QUOTE_VALIDITY_HOURS = 48;

const withCustomer = {
  include: {
    customer: { select: { name: true, email: true, phone: true } },
    quotedBy: { select: { email: true } },
    rateQuoteOptions: { include: { rateProvider: true } },
    selectedOption: { include: { rateProvider: true } },
  },
};
export type QuoteWithCustomer = Prisma.QuoteGetPayload<typeof withCustomer>;

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly notificationsService: NotificationsService,
    private readonly pricingEngineService: PricingEngineService,
    private readonly configService: ConfigService,
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

    const manualReviewReason = this.classifyManualReview(
      dto.shipmentType,
      dto.weightKg,
    );
    let status: QuoteStatusCode = manualReviewReason
      ? 'NEEDS_MANUAL_REVIEW'
      : 'SUBMITTED';
    let reviewReason: QuoteReviewReasonCode | null = manualReviewReason;
    let computedOptions: ComputedRateOption[] = [];

    // classifyManualReview's flags (OTHER shipment type, oversized weight) short-circuit before
    // the pricing engine ever runs — those always need a human's eyes regardless of rate-card
    // data.
    if (status !== 'NEEDS_MANUAL_REVIEW') {
      computedOptions = await this.pricingEngineService.computeQuotesForRequest(
        {
          destinationCountryName: dto.destination.country,
          weightKg: dto.weightKg,
          shipmentType: dto.shipmentType,
        },
      );
      if (computedOptions.length > 0) {
        status = 'RATED';
      } else {
        status = 'NEEDS_MANUAL_REVIEW';
        reviewReason = 'NO_RATE_AVAILABLE';
      }
    }

    const validityHours =
      this.configService.get<number>('QUOTE_VALIDITY_HOURS') ??
      DEFAULT_QUOTE_VALIDITY_HOURS;

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
          // Nested create — one atomic write with the quote row itself, so a RATED quote can
          // never end up with zero option rows on a partial failure (Section: Quote lifecycle).
          optionsExpireAt:
            status === 'RATED'
              ? new Date(Date.now() + validityHours * 60 * 60 * 1000)
              : null,
          ...(status === 'RATED'
            ? {
                rateQuoteOptions: {
                  create: computedOptions.map((option) => ({
                    rateProviderId: option.rateProviderId,
                    rateCardId: option.rateCardId,
                    weightSlabId: option.weightSlabId,
                    currency: option.currency,
                    baseRate: option.baseRate,
                    pssAmount: option.pssAmount,
                    fuelChargePercent: option.fuelChargePercent,
                    fuelChargeAmount: option.fuelChargeAmount,
                    taxableSubtotal: option.taxableSubtotal,
                    gstPercent: option.gstPercent,
                    gstAmount: option.gstAmount,
                    nationwideCut: option.nationwideCut,
                    finalPrice: option.finalPrice,
                  })),
                },
              }
            : {}),
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

  // Stateless — nothing is persisted. Powers the "compare providers" step of the customer quote
  // wizard, which happens before any address is collected and may or may not ever lead to an
  // actual Quote row. Reuses the exact same PricingEngineService call the real create() path
  // uses, so preview and final prices can only ever differ because a rate genuinely changed in
  // between, never because of separate calculation logic.
  async preview(dto: QuotePreviewQueryDto): Promise<QuotePreviewResultDto> {
    // Shares classifyManualReview with create() so the two paths can never classify the exact
    // same request differently (e.g. previewing "Other" used to short-circuit here as
    // NO_RATE_AVAILABLE while the real create() call classified it as MISCELLANEOUS moments
    // later — two independent copies of the same logic drifting apart).
    const manualReviewReason = this.classifyManualReview(
      dto.shipmentType,
      dto.weightKg,
    );
    if (manualReviewReason) {
      return {
        status: 'NEEDS_MANUAL_REVIEW',
        reviewReason: manualReviewReason,
        options: [],
      };
    }

    const computedOptions =
      await this.pricingEngineService.computeQuotesForRequest({
        destinationCountryName: dto.destinationCountry,
        weightKg: dto.weightKg,
        shipmentType: dto.shipmentType,
      });

    if (computedOptions.length === 0) {
      return {
        status: 'NEEDS_MANUAL_REVIEW',
        reviewReason: 'NO_RATE_AVAILABLE',
        options: [],
      };
    }

    return {
      status: 'RATED',
      reviewReason: null,
      options: computedOptions.map((option) => ({
        rateProviderId: option.rateProviderId,
        rateProviderName: option.rateProviderName,
        currency: option.currency,
        finalPrice: option.finalPrice,
      })),
    };
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

    const { order } =
      await this.ordersService.createOrderWithShipment(customerId);
    await this.finalizeAcceptedQuote(quote, order);

    return this.findOneOrThrow(id);
  }

  // Selecting a provider option from a RATED quote's comparison IS the customer's final
  // commitment for that path — unlike the manual-quote flow's separate accept step, there's no
  // second confirmation, since choosing one option among several already is the confirmation
  // (Section: Multiple provider quotations / Customer quote comparison).
  async selectOption(
    id: string,
    optionId: string,
    customerId: string,
  ): Promise<QuoteWithCustomer> {
    const quote = await this.findOneOrThrow(id);
    if (quote.customerId !== customerId) {
      throw new ForbiddenException('This quote does not belong to you');
    }
    const option = quote.rateQuoteOptions.find((o) => o.id === optionId);
    if (!option) {
      throw new BadRequestException(
        'This option does not belong to this quote',
      );
    }
    if (quote.status !== 'RATED') {
      throw new BadRequestException(
        `Quote must be RATED to select an option (current status: ${quote.status})`,
      );
    }
    if (!quote.optionsExpireAt || quote.optionsExpireAt < new Date()) {
      throw new BadRequestException(
        'This quote has expired. Please request a new quote.',
      );
    }

    // Conditional claim, not check-then-act — closes a race against a concurrent admin
    // manual-quote override (or a double-submitted select) landing on the same RATED quote.
    const claim = await this.prisma.quote.updateMany({
      where: { id, status: 'RATED' },
      data: { status: 'ACCEPTED' },
    });
    if (claim.count !== 1) {
      throw new BadRequestException(
        'This quote is no longer available for selection',
      );
    }

    const { order } =
      await this.ordersService.createOrderWithShipment(customerId);
    await this.finalizeAcceptedQuote(quote, order, { selectedOption: option });

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

  // Shared by acceptQuote (manual-quote path) and selectOption (auto-priced path). The optional
  // spread means the manual-quote path's payload to prisma.quote.update stays byte-identical to
  // before this was extracted — selectedOptionId/quotedAmount/quotedCurrency are only present
  // when opts is passed.
  private async finalizeAcceptedQuote(
    quote: QuoteWithCustomer,
    order: { id: string },
    opts?: { selectedOption: QuoteWithCustomer['rateQuoteOptions'][number] },
  ): Promise<void> {
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
      data: {
        orderId: order.id,
        status: 'ACCEPTED',
        ...(opts
          ? {
              selectedOptionId: opts.selectedOption.id,
              quotedAmount: opts.selectedOption.finalPrice,
              quotedCurrency: opts.selectedOption.currency,
            }
          : {}),
      },
    });
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
      throw new BadRequestException(
        `Invalid pickupTimeSlot: ${pickupTimeSlot}`,
      );
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

  // Flags what's unambiguous from shipmentType/weight alone, BEFORE the pricing engine ever
  // runs — dangerous/miscellaneous/oversized shipments always need a human's eyes regardless of
  // whether a rate card exists. Shared by create() and preview() so both always agree on the
  // same request (Section: Quote lifecycle). Returns null when the pricing engine should decide
  // (RATED vs NEEDS_MANUAL_REVIEW/NO_RATE_AVAILABLE).
  private classifyManualReview(
    shipmentType: CreateQuoteDto['shipmentType'],
    weightKg: number,
  ): QuoteReviewReasonCode | null {
    if (shipmentType === 'OTHER') {
      return 'MISCELLANEOUS';
    }
    if (weightKg > OVERSIZED_WEIGHT_KG) {
      return 'OVERSIZED';
    }
    return null;
  }
}
