import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  chargeableWeightKg,
  type B2bOrderResultDto,
  type B2bRequestSummaryDto,
  type PickupDocumentsDto,
  type PickupRequestStatusCode,
  type RecalculatePreviewDto,
} from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../database/storage.service';
import { cleanItems, cleanPackages } from '../../common/dto/parcel.dto';
import { AddressBookService } from '../customers/address-book.service';
import { QuotesService } from '../quotes/quotes.service';
import { OrdersService } from '../orders/orders.service';
import { InvoicesService } from '../invoices/invoices.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { PushService } from '../push/push.service';
import {
  PricingEngineService,
  type ComputedRateOption,
} from '../pricing/pricing-engine.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TEMPLATES } from '../notifications/templates';
import { CreatePickupRequestDto } from './dto/create-pickup-request.dto';
import { QueryPickupRequestsDto } from './dto/query-pickup-requests.dto';
import { RecalculateWeightDto } from './dto/recalculate-weight.dto';
import { VerifyPickupRequestDto } from './dto/verify-pickup-request.dto';
import { CollectPaymentDto } from './dto/collect-payment.dto';
import { AcceptParcelDto } from './dto/accept-parcel.dto';
import { RejectParcelDto } from './dto/reject-parcel.dto';
import { RecipientAddressDto } from './dto/recipient-address.dto';
import { AdminCreatePickupOrderDto } from './dto/admin-create-pickup-order.dto';
import { B2bCreateOrdersDto, B2bOrderDto } from './dto/b2b-create-orders.dto';
import { resolveMapsUrl } from './maps-url';

const withDetails = {
  include: {
    // aadhaarKey is read only to say whether one is on file — the mapper never exposes the key.
    customer: { select: { name: true, phone: true, aadhaarKey: true } },
    assignedPartner: {
      select: { id: true, name: true, email: true, phone: true },
    },
    quote: {
      select: {
        destName: true,
        destPhone: true,
        destAddressLine1: true,
        destAddressLine2: true,
        destCity: true,
        destState: true,
        destPostalCode: true,
        destCountry: true,
        packages: true,
        items: true,
      },
    },
  },
};
export type PickupRequestWithDetails = Prisma.PickupRequestGetPayload<
  typeof withDetails
>;

const NON_TERMINAL_STATUSES: PickupRequestStatusCode[] = [
  'PENDING_ASSIGNMENT',
  'ASSIGNED',
  'SCHEDULED',
  'OUT_FOR_PICKUP',
  'VERIFICATION_PENDING',
];

// Cash-collection tolerance (Section: fraud/collusion defense) — collectedAmount is partner-
// reported and has no independent confirmation, so it's checked against the price the system
// itself already computed (verifiedPrice, falling back to estimatedPrice) rather than trusted
// outright. Wide enough to absorb legitimate rounding, narrow enough that a partner pocketing
// the difference on a cash collection can't just under-report and walk away with it.
const COLLECTED_AMOUNT_TOLERANCE_RATIO = 0.05;
const COLLECTED_AMOUNT_TOLERANCE_FLOOR = 50;

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

/** What a booking charges, and what that writes back onto the quote. */
interface BookingPricing {
  rateProviderId: string | null;
  rateProviderName: string | null;
  estimatedPrice: number;
  currency: string;
  quote: Prisma.QuoteUncheckedUpdateManyInput;
}

type PickupLogistics = Pick<
  CreatePickupRequestDto,
  | 'dropAtWarehouse'
  | 'pickupContactName'
  | 'pickupContactPhone'
  | 'pickupAddressLine1'
  | 'pickupAddressLine2'
  | 'pickupCity'
  | 'pickupState'
  | 'pickupPostalCode'
  | 'pickupLatitude'
  | 'pickupLongitude'
  | 'pickupDate'
  | 'pickupTimeSlot'
  | 'pickupInstructions'
> & { pickupMapsUrl?: string };

// The "where and when" columns of a PickupRequest, shared by the customer and admin booking paths.
// Blank on a warehouse drop-off: there is no pickup address to record.
function pickupLogisticsData(dto: PickupLogistics) {
  const pickup = !dto.dropAtWarehouse;
  return {
    dropAtWarehouse: dto.dropAtWarehouse,
    pickupContactName: dto.pickupContactName,
    pickupContactPhone: dto.pickupContactPhone,
    pickupAddressLine1: pickup ? (dto.pickupAddressLine1 ?? '') : '',
    pickupAddressLine2: pickup ? (dto.pickupAddressLine2 ?? null) : null,
    pickupCity: pickup ? (dto.pickupCity ?? '') : '',
    pickupState: pickup ? (dto.pickupState ?? '') : '',
    pickupPostalCode: pickup ? (dto.pickupPostalCode ?? '') : '',
    pickupLatitude: pickup ? (dto.pickupLatitude ?? null) : null,
    pickupLongitude: pickup ? (dto.pickupLongitude ?? null) : null,
    pickupMapsUrl: pickup ? (dto.pickupMapsUrl ?? null) : null,
    pickupDate: pickup && dto.pickupDate ? new Date(dto.pickupDate) : null,
    pickupTimeSlot: pickup ? (dto.pickupTimeSlot ?? null) : null,
    pickupInstructions: dto.pickupInstructions ?? null,
  };
}

// The recipient lives on the quote's dest* fields, whoever entered it.
function recipientToQuoteData(recipient: RecipientAddressDto) {
  return {
    destName: recipient.name,
    destPhone: recipient.phone,
    destAddressLine1: recipient.addressLine1,
    destAddressLine2: recipient.addressLine2 || null,
    destCity: recipient.city,
    destState: recipient.state,
    destPostalCode: recipient.postalCode,
  };
}

// The new pre-order self-service flow (Section: Pickup Partner workflow) — bridges a customer's
// PENDING_PICKUP_REQUEST Quote to a real Order, but only once a Pickup Partner has physically
// verified the parcel, collected payment, and accepted it. See QuotesService.selectOption/
// acceptQuote for the discriminator (Quote.fulfillmentMethod null) that routes a quote here
// instead of the legacy immediate-order-creation path.
@Injectable()
export class PickupRequestsService {
  private readonly logger = new Logger(PickupRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly pricingEngineService: PricingEngineService,
    private readonly notificationsService: NotificationsService,
    // A partner-collected payment owes the customer the same bill and receipt an admin-marked
    // one does; see acceptParcel.
    private readonly invoicesService: InvoicesService,
    private readonly receiptsService: ReceiptsService,
    // The partner's own heads-up when a pickup is assigned to them; see assignPartner.
    private readonly pushService: PushService,
    // Remembers shipped contents so the next booking can pick them.
    private readonly addressBook: AddressBookService,
    // Staff booking on a customer's behalf prices through the same quote path as the customer.
    private readonly quotesService: QuotesService,
    // Aadhaar and parcel photos taken at the door.
    private readonly storage: StorageService,
  ) {}

  async create(
    dto: CreatePickupRequestDto,
    customerId: string,
  ): Promise<PickupRequestWithDetails> {
    const quote = await this.prisma.quote.findUnique({
      where: { id: dto.quoteId },
      include: { selectedOption: { include: { rateProvider: true } } },
    });
    if (!quote) {
      throw new NotFoundException(`Quote ${dto.quoteId} not found`);
    }
    if (quote.customerId !== customerId) {
      throw new ForbiddenException('This quote does not belong to you');
    }
    if (quote.status !== 'PENDING_PICKUP_REQUEST') {
      throw new BadRequestException(
        `Quote must be PENDING_PICKUP_REQUEST to submit a pickup request (current status: ${quote.status})`,
      );
    }
    if (!dto.dropAtWarehouse && (!dto.pickupDate || !dto.pickupTimeSlot)) {
      throw new BadRequestException(
        'pickupDate and pickupTimeSlot are required unless dropAtWarehouse is true',
      );
    }

    // RATED path (selectOption) snapshots the chosen provider's option; the manual-quote path
    // (acceptQuote) has no specific RateProvider attached at all — see the PickupRequest.
    // rateProviderId doc comment in schema.prisma.
    const rateProviderId = quote.selectedOption?.rateProviderId ?? null;
    const rateProviderName = quote.selectedOption?.rateProvider.name ?? null;
    const estimatedPrice = quote.selectedOption
      ? quote.selectedOption.finalPrice
      : (quote.quotedAmount ?? 0);
    const currency = quote.selectedOption
      ? quote.selectedOption.currency
      : (quote.quotedCurrency ?? 'INR');

    // Atomic claim-then-create inside one interactive transaction — the earlier version read
    // quote.status above, then created the PickupRequest, then updated quote.status as two
    // separate non-transactional calls. Two concurrent submissions (double-click, retry after a
    // slow response) could both pass the status check above before either write landed, creating
    // two PickupRequest rows for one quote. The updateMany here only ever succeeds for the first
    // caller — updateMany's own WHERE re-checks status atomically against the database, not the
    // in-memory `quote` read above, so a second concurrent caller gets count 0 and rolls back
    // instead of creating a duplicate row.
    const created = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.quote.updateMany({
        where: { id: quote.id, status: 'PENDING_PICKUP_REQUEST' },
        data: { status: 'PICKUP_REQUESTED' },
      });
      if (claim.count === 0) {
        throw new BadRequestException(
          `Quote must be PENDING_PICKUP_REQUEST to submit a pickup request (current status: ${quote.status})`,
        );
      }

      // The recipient is optional here — the partner confirms (or takes it down) at the door
      // either way. The contents are not: carriers will not move a parcel without them.
      await tx.quote.update({
        where: { id: quote.id },
        data: {
          ...(dto.recipient ? recipientToQuoteData(dto.recipient) : {}),
          items: cleanItems(dto.items),
        },
      });

      return tx.pickupRequest.create({
        data: {
          quoteId: quote.id,
          customerId,
          rateProviderId,
          rateProviderName,
          shipmentType: quote.shipmentType,
          estimatedWeightKg: quote.weightKg,
          estimatedPrice,
          currency,
          ...pickupLogisticsData(dto),
        },
      });
    });

    await this.addressBook.remember(customerId, dto.items);

    await this.notificationsService.enqueue(
      customerId,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.PICKUP_REQUEST_RECEIVED,
      {},
    );

    // Broadcast, not auto-assign (Rapido/Blinkit style): the request stays PENDING_ASSIGNMENT
    // and every active partner sees it until one claims it. An admin can still hand-assign.
    // Warehouse drop-offs are handled by admin at the warehouse — nothing for a partner to do.
    const full = await this.findOne(created.id);
    if (!dto.dropAtWarehouse) await this.broadcastToPartners(full);

    return full;
    return this.findOne(created.id);
  }

  /**
   * The one place a priced quote becomes a pickup request: claims the quote (atomically, so a
   * retried submit cannot book it twice) and creates the pickup in the same transaction. Shared by
   * staff booking (assigned to a chosen partner) and the B2B portal (broadcast to every partner).
   */
  private async commitBooking(params: {
    quote: { id: string; status: string; weightKg: number };
    customerId: string;
    shipmentType: AdminCreatePickupOrderDto['shipmentType'];
    recipient: RecipientAddressDto;
    items: AdminCreatePickupOrderDto['items'];
    logistics: PickupLogistics;
    pricing: BookingPricing;
    partnerId?: string;
  }): Promise<PickupRequestWithDetails> {
    const { quote, pricing, partnerId } = params;
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.quote.updateMany({
        where: {
          id: quote.id,
          status: { in: ['RATED', 'NEEDS_MANUAL_REVIEW'] },
        },
        data: {
          status: 'PICKUP_REQUESTED',
          ...recipientToQuoteData(params.recipient),
          items: cleanItems(params.items),
          ...pricing.quote,
        },
      });
      if (claim.count === 0) {
        throw new BadRequestException(
          `This booking was already processed (quote status: ${quote.status})`,
        );
      }
      return tx.pickupRequest.create({
        data: {
          quoteId: quote.id,
          customerId: params.customerId,
          rateProviderId: pricing.rateProviderId,
          rateProviderName: pricing.rateProviderName,
          shipmentType: params.shipmentType,
          estimatedWeightKg: quote.weightKg,
          estimatedPrice: pricing.estimatedPrice,
          currency: pricing.currency,
          ...pickupLogisticsData(params.logistics),
          ...(partnerId
            ? {
                assignedPartnerId: partnerId,
                assignedAt: new Date(),
                status: 'ASSIGNED' as const,
              }
            : {}),
        },
        ...withDetails,
      });
    });
  }

  // Every active partner sees an unclaimed request until one takes it (see claim).
  private async broadcastToPartners(
    pickupRequest: PickupRequestWithDetails,
  ): Promise<void> {
    const partners = await this.prisma.adminUser.findMany({
      where: { role: 'PICKUP_PARTNER', isActive: true },
      select: { id: true },
    });
    for (const partner of partners) {
      void this.pushService.sendToAdminUser(partner.id, {
        title: 'New pickup request',
        body: [
          pickupRequest.pickupContactName,
          pickupRequest.pickupCity,
          pickupRequest.pickupTimeSlot,
        ]
          .filter(Boolean)
          .join(' · '),
        url: `/partner/pickups/${pickupRequest.id}`,
        tag: `pickup-${pickupRequest.id}`,
      });
    }
  }

  /**
   * A business customer's staff booking several shipments at once from their standing link: one
   * pickup address and slot, many recipients. Each shipment is its own quote and its own pickup
   * request (they go to different countries and are priced and tracked separately), all collected
   * from the same address.
   *
   * A shipment no rate card covers is NOT broadcast: its quote is left for an admin to price, the
   * same rule QuotesService.create applies to a customer's own unpriced quote. The caller is told
   * per shipment which happened.
   */
  async createBatchForCustomer(
    customerId: string,
    dto: B2bCreateOrdersDto,
  ): Promise<B2bOrderResultDto[]> {
    const results: B2bOrderResultDto[] = [];
    const booked: PickupRequestWithDetails[] = [];

    // A pasted short link carries no coordinates until expanded.
    let { pickupLatitude, pickupLongitude } = dto.pickup;
    if (pickupLatitude == null && dto.pickup.pickupMapsUrl) {
      const resolved = await resolveMapsUrl(dto.pickup.pickupMapsUrl);
      pickupLatitude = resolved?.latitude;
      pickupLongitude = resolved?.longitude;
    }
    const logistics: PickupLogistics = {
      ...dto.pickup,
      dropAtWarehouse: false,
      pickupLatitude,
      pickupLongitude,
    };

    for (const [index, order] of dto.orders.entries()) {
      // Per-shipment key derived from the batch's: a retried submit converges on the same rows
      // rather than booking the whole batch again.
      const quote = await this.quotesService.create(
        {
          shipmentType: order.shipmentType,
          weightKg: chargeableWeightKg(order.packages),
          packages: order.packages,
          destination: {
            ...order.recipient,
            country: order.destinationCountry,
          },
          submissionKey: `${dto.submissionKey}:${index}`,
        },
        customerId,
      );

      if (quote.status === 'PICKUP_REQUESTED') {
        const existing = await this.prisma.pickupRequest.findUnique({
          where: { quoteId: quote.id },
          ...withDetails,
        });
        if (existing) {
          results.push(this.toOrderResult(index, order, existing));
          continue;
        }
      }

      if (quote.status !== 'RATED') {
        // No rate card covers this route/weight. An admin prices it and the customer is contacted;
        // nothing is dispatched on a price nobody has set.
        results.push({
          index,
          recipientName: order.recipient.name,
          destinationCountry: order.destinationCountry,
          status: 'NEEDS_PRICING',
          quoteId: quote.id,
          pickupRequestId: null,
          carrier: null,
          price: null,
          currency: null,
        });
        continue;
      }

      // The carrier they chose, or the cheapest available when they left it to us.
      const option = order.rateProviderId
        ? quote.rateQuoteOptions.find(
            (o) => o.rateProviderId === order.rateProviderId,
          )
        : [...quote.rateQuoteOptions].sort(
            (a, b) => a.finalPrice - b.finalPrice,
          )[0];
      if (!option) {
        throw new BadRequestException(
          `Shipment ${index + 1}: that carrier no longer quotes this shipment — refresh prices`,
        );
      }

      const created = await this.commitBooking({
        quote,
        customerId,
        shipmentType: order.shipmentType,
        recipient: order.recipient,
        items: order.items,
        logistics,
        pricing: {
          rateProviderId: option.rateProviderId,
          rateProviderName: option.rateProvider.name,
          estimatedPrice: option.finalPrice,
          currency: option.currency,
          quote: {
            selectedOptionId: option.id,
            quotedAmount: option.finalPrice,
            quotedCurrency: option.currency,
          },
        },
      });
      booked.push(created);
      results.push(this.toOrderResult(index, order, created));
      await this.addressBook.remember(customerId, order.items);
    }

    if (booked.length > 0) {
      // One message for the batch, not one per shipment — a business booking twenty parcels does
      // not want twenty WhatsApps.
      await this.notificationsService.enqueue(
        customerId,
        'WHATSAPP',
        NOTIFICATION_TEMPLATES.PICKUP_REQUEST_RECEIVED,
        {},
      );
      for (const pickupRequest of booked) {
        await this.broadcastToPartners(pickupRequest);
      }
    }

    return results;
  }

  /** The business's own shipments, newest first — the portal's history list. */
  async summariesForCustomer(
    customerId: string,
  ): Promise<B2bRequestSummaryDto[]> {
    const requests = await this.prisma.pickupRequest.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      ...withDetails,
    });
    return requests.map((r) => ({
      id: r.id,
      status: r.status,
      recipientName: r.quote.destName,
      destinationCountry: r.quote.destCountry,
      pickupDate: r.pickupDate ? r.pickupDate.toISOString().slice(0, 10) : null,
      price: r.verifiedPrice ?? r.estimatedPrice,
      currency: r.currency,
      carrier: r.rateProviderName,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Who a B2B link belongs to, for the portal header. */
  async customerName(customerId: string): Promise<string> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { name: true },
    });
    if (!customer)
      throw new NotFoundException(`Customer ${customerId} not found`);
    return customer.name;
  }

  private toOrderResult(
    index: number,
    order: B2bOrderDto,
    pickupRequest: PickupRequestWithDetails,
  ): B2bOrderResultDto {
    return {
      index,
      recipientName: order.recipient.name,
      destinationCountry: order.destinationCountry,
      status: 'BOOKED',
      quoteId: pickupRequest.quoteId,
      pickupRequestId: pickupRequest.id,
      carrier: pickupRequest.rateProviderName,
      price: pickupRequest.estimatedPrice,
      currency: pickupRequest.currency,
    };
  }

  /**
   * Staff booking a pickup on a customer's behalf (a phone-in or walk-in) and handing it straight
   * to a partner of their choosing — no broadcast. Prices through QuotesService.create exactly as
   * the customer wizard does; the chosen carrier's option (or a staff-entered price where none is
   * wanted or rated) is committed in the same transaction that creates the pickup, so the quote can
   * never be left half-booked. The Order is still only created when the partner completes pickup.
   */
  async createForAdmin(
    dto: AdminCreatePickupOrderDto,
    actorId: string,
  ): Promise<PickupRequestWithDetails> {
    const [customer, partner] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: dto.customerId } }),
      this.prisma.adminUser.findUnique({ where: { id: dto.partnerId } }),
    ]);
    if (!customer) {
      throw new NotFoundException(`Customer ${dto.customerId} not found`);
    }
    if (!partner || partner.role !== 'PICKUP_PARTNER' || !partner.isActive) {
      throw new NotFoundException(`Pickup partner ${dto.partnerId} not found`);
    }
    if (
      (dto.rateProviderId === undefined) ===
      (dto.manualPrice === undefined)
    ) {
      throw new BadRequestException(
        'Choose a carrier or enter a price — exactly one of the two',
      );
    }

    const quote = await this.quotesService.create(
      {
        shipmentType: dto.shipmentType,
        weightKg: chargeableWeightKg(dto.packages),
        packages: dto.packages,
        destination: { ...dto.recipient, country: dto.destinationCountry },
        submissionKey: dto.submissionKey,
      },
      dto.customerId,
    );

    // A retried submit (same submissionKey) gets the pickup the first attempt already created.
    if (quote.status === 'PICKUP_REQUESTED') {
      const existing = await this.prisma.pickupRequest.findUnique({
        where: { quoteId: quote.id },
        ...withDetails,
      });
      if (existing) return existing;
    }

    let pricing: BookingPricing;
    if (dto.rateProviderId) {
      const option = quote.rateQuoteOptions.find(
        (o) => o.rateProviderId === dto.rateProviderId,
      );
      if (quote.status !== 'RATED' || !option) {
        throw new BadRequestException(
          'The selected carrier no longer quotes this shipment — get prices again',
        );
      }
      pricing = {
        rateProviderId: option.rateProviderId,
        rateProviderName: option.rateProvider.name,
        estimatedPrice: option.finalPrice,
        currency: option.currency,
        quote: {
          selectedOptionId: option.id,
          quotedAmount: option.finalPrice,
          quotedCurrency: option.currency,
        },
      };
    } else {
      const amount = dto.manualPrice!;
      pricing = {
        rateProviderId: null,
        rateProviderName: null,
        estimatedPrice: amount,
        currency: 'INR',
        quote: {
          quotedAmount: amount,
          quotedCurrency: 'INR',
          quotedByAdminId: actorId,
          quotedAt: new Date(),
        },
      };
    }

    // A pasted short link carries no coordinates until expanded. The admin UI resolves it first;
    // this only covers a client that did not.
    let { pickupLatitude, pickupLongitude } = dto;
    if (pickupLatitude == null && dto.pickupMapsUrl) {
      const resolved = await resolveMapsUrl(dto.pickupMapsUrl);
      pickupLatitude = resolved?.latitude;
      pickupLongitude = resolved?.longitude;
    }

    const created = await this.commitBooking({
      quote,
      customerId: dto.customerId,
      shipmentType: dto.shipmentType,
      recipient: dto.recipient,
      items: dto.items,
      logistics: {
        ...dto,
        dropAtWarehouse: false,
        pickupLatitude,
        pickupLongitude,
      },
      pricing,
      partnerId: dto.partnerId,
    });

    await this.addressBook.remember(dto.customerId, dto.items);
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'PICKUP_REQUEST_CREATED_BY_ADMIN',
        entity: 'PickupRequest',
        entityId: created.id,
        after: {
          quoteId: quote.id,
          assignedPartnerId: dto.partnerId,
          estimatedPrice: pricing.estimatedPrice,
        },
      },
    });
    await this.notificationsService.enqueue(
      dto.customerId,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.PICKUP_REQUEST_RECEIVED,
      {},
    );
    await this.announceAssignment(created, dto.partnerId);
    return this.findOne(created.id);
  }

  // A partner taking an open request. The WHERE re-checks "still unclaimed" against the database,
  // so when two partners tap Accept at the same moment exactly one wins and the other gets a
  // clear "already taken" instead of both believing the pickup is theirs.
  async claim(
    id: string,
    partnerId: string,
  ): Promise<PickupRequestWithDetails> {
    const won = await this.prisma.pickupRequest.updateMany({
      where: {
        id,
        status: 'PENDING_ASSIGNMENT',
        assignedPartnerId: null,
        dropAtWarehouse: false,
      },
      data: {
        assignedPartnerId: partnerId,
        assignedAt: new Date(),
        status: 'ASSIGNED',
      },
    });
    if (won.count === 0) {
      throw new BadRequestException(
        'This pickup request has already been taken by another partner',
      );
    }

    const pickupRequest = await this.findOne(id);
    await this.prisma.auditLog.create({
      data: {
        actorId: partnerId,
        action: 'PICKUP_REQUEST_PARTNER_ASSIGNED',
        entity: 'PickupRequest',
        entityId: id,
        before: { assignedPartnerId: null },
        after: { assignedPartnerId: partnerId },
      },
    });
    await this.notificationsService.enqueue(
      pickupRequest.customerId,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.PICKUP_PARTNER_ASSIGNED,
      {},
    );
    return pickupRequest;
  }

  findAllForCustomer(customerId: string): Promise<PickupRequestWithDetails[]> {
    return this.prisma.pickupRequest.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      ...withDetails,
    });
  }

  async findOneForCustomer(
    id: string,
    customerId: string,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOne(id);
    if (pickupRequest.customerId !== customerId) {
      throw new NotFoundException(`Pickup request ${id} not found`);
    }
    return pickupRequest;
  }

  findAllForAdmin(
    query: QueryPickupRequestsDto,
  ): Promise<PickupRequestWithDetails[]> {
    const where: Prisma.PickupRequestWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.orderId) where.orderId = query.orderId;
    if (query.search) {
      where.customer = {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }
    return this.prisma.pickupRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...withDetails,
    });
  }

  async findOne(id: string): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.prisma.pickupRequest.findUnique({
      where: { id },
      ...withDetails,
    });
    if (!pickupRequest) {
      throw new NotFoundException(`Pickup request ${id} not found`);
    }
    return pickupRequest;
  }

  async assignPartner(
    id: string,
    partnerId: string,
    actorId: string,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOne(id);
    if (!NON_TERMINAL_STATUSES.includes(pickupRequest.status)) {
      throw new BadRequestException(
        `Cannot assign a partner to a pickup request that is already ${pickupRequest.status}`,
      );
    }
    const partner = await this.prisma.adminUser.findUnique({
      where: { id: partnerId },
    });
    if (!partner || partner.role !== 'PICKUP_PARTNER') {
      // NotFound (404), not BadRequest (400) — the request itself is well-formed, the
      // referenced partner simply doesn't exist, matching this codebase's convention elsewhere
      // (e.g. RatesService/ZonesService both use NotFoundException for missing-entity lookups).
      throw new NotFoundException(`Pickup partner ${partnerId} not found`);
    }

    await this.prisma.pickupRequest.update({
      where: { id },
      data: {
        assignedPartnerId: partnerId,
        assignedAt: new Date(),
        status: 'ASSIGNED',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'PICKUP_REQUEST_PARTNER_ASSIGNED',
        entity: 'PickupRequest',
        entityId: id,
        before: { assignedPartnerId: pickupRequest.assignedPartnerId },
        after: { assignedPartnerId: partnerId },
      },
    });

    await this.announceAssignment(pickupRequest, partnerId);
    return this.findOne(id);
  }

  // Tells the customer a partner is coming and the partner that they have somewhere to be.
  private async announceAssignment(
    pickupRequest: PickupRequestWithDetails,
    partnerId: string,
  ): Promise<void> {
    const id = pickupRequest.id;
    await this.notificationsService.enqueue(
      pickupRequest.customerId,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.PICKUP_PARTNER_ASSIGNED,
      {},
    );

    // The customer's message above says a partner is coming; this tells the partner, on their
    // phone, that they have somewhere to be. Fire-and-forget like every push.
    void this.pushService.sendToAdminUser(partnerId, {
      title: 'New pickup assigned',
      body: [
        pickupRequest.pickupContactName,
        pickupRequest.dropAtWarehouse
          ? 'warehouse drop-off'
          : pickupRequest.pickupCity,
        pickupRequest.pickupDate
          ? pickupRequest.pickupDate.toISOString().slice(0, 10)
          : null,
        pickupRequest.pickupTimeSlot,
      ]
        .filter(Boolean)
        .join(' · '),
      url: `/partner/pickups/${id}`,
      tag: `pickup-${id}`,
    });
  }

  findAllForPartner(
    partnerId: string,
    query: QueryPickupRequestsDto,
  ): Promise<PickupRequestWithDetails[]> {
    // Their own pickups plus every open, unclaimed request up for grabs.
    const where: Prisma.PickupRequestWhereInput = {
      OR: [
        { assignedPartnerId: partnerId },
        {
          assignedPartnerId: null,
          status: 'PENDING_ASSIGNMENT',
          dropAtWarehouse: false,
        },
      ],
    };
    if (query.status) where.status = query.status;
    return this.prisma.pickupRequest.findMany({
      where,
      orderBy: { pickupDate: 'asc' },
      ...withDetails,
    });
  }

  // Read-only view: an open request is visible to every partner so they can decide to claim it.
  // Every action below still goes through findOneForPartner, which requires the claim first.
  async findOneVisibleToPartner(
    id: string,
    partnerId: string,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOne(id);
    const isOpen =
      pickupRequest.assignedPartnerId === null &&
      pickupRequest.status === 'PENDING_ASSIGNMENT' &&
      !pickupRequest.dropAtWarehouse;
    if (!isOpen && pickupRequest.assignedPartnerId !== partnerId) {
      throw new NotFoundException(`Pickup request ${id} not found`);
    }
    return pickupRequest;
  }

  // Who may work a pickup: its assigned partner, or — for a warehouse drop-off, which never goes
  // to a partner — any admin/staff (asAdmin, set only by AdminPickupRequestsController). The actor
  // id is an AdminUser either way, so audit logs and payment attribution stay valid.
  async findOneForPartner(
    id: string,
    partnerId: string,
    asAdmin = false,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOne(id);
    if (asAdmin) {
      if (!pickupRequest.dropAtWarehouse) {
        throw new BadRequestException(
          'Only warehouse drop-offs are handled by admin; this pickup belongs to a partner',
        );
      }
      return pickupRequest;
    }
    if (pickupRequest.assignedPartnerId !== partnerId) {
      throw new NotFoundException(`Pickup request ${id} not found`);
    }
    return pickupRequest;
  }

  // Stateless pricing preview — nothing persisted, mirrors QuotesService.preview(). Lets the
  // partner try several corrected weights before committing via verify().
  async recalculate(
    id: string,
    dto: RecalculateWeightDto,
    partnerId: string,
    asAdmin = false,
  ): Promise<RecalculatePreviewDto> {
    const pickupRequest = await this.findOneForPartner(id, partnerId, asAdmin);
    const recalculated = await this.repriceAgainstOriginalProvider(
      pickupRequest,
      dto.weightKg,
      dto.shipmentType,
    );
    const recalculatedPrice = recalculated?.finalPrice ?? null;
    const estimatedPrice = pickupRequest.estimatedPrice;
    return {
      estimatedPrice,
      recalculatedPrice,
      difference:
        recalculatedPrice === null ? null : recalculatedPrice - estimatedPrice,
      currency: pickupRequest.currency,
    };
  }

  // Step 1 of the mobile 3-step workflow (Arrived -> Verify/Pay -> Complete) — records that the
  // partner is physically at the pickup location. Idempotent on retry (unlike collectPayment):
  // arriving twice is harmless, so a flaky mobile network re-sending the same tap should never
  // surface an error, just the current (already-arrived) state.
  async markArrived(
    id: string,
    partnerId: string,
    asAdmin = false,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOneForPartner(id, partnerId, asAdmin);
    if (!NON_TERMINAL_STATUSES.includes(pickupRequest.status)) {
      throw new BadRequestException(
        `Cannot mark arrival on a pickup request that is already ${pickupRequest.status}`,
      );
    }
    if (pickupRequest.arrivedAt) {
      return pickupRequest;
    }

    // Atomic claim (arrivedAt: null guard re-checked against the database) — the row that wins
    // this update is the only one that writes the audit log below, so a duplicate tap/retry
    // never double-logs.
    const claim = await this.prisma.pickupRequest.updateMany({
      where: { id, arrivedAt: null },
      data: { arrivedAt: new Date(), status: 'OUT_FOR_PICKUP' },
    });
    if (claim.count === 0) {
      return this.findOneForPartner(id, partnerId, asAdmin);
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: partnerId,
        action: 'PICKUP_REQUEST_ARRIVED',
        entity: 'PickupRequest',
        entityId: id,
        before: { arrivedAt: null },
        after: { arrivedAt: new Date().toISOString() },
      },
    });

    return this.findOne(id);
  }

  // Persists the verification. Re-runs the pricing engine itself from the request body rather
  // than trusting a client-echoed price from recalculate() — never persists a stale/tampered
  // price.
  async verify(
    id: string,
    dto: VerifyPickupRequestDto,
    partnerId: string,
    asAdmin = false,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOneForPartner(id, partnerId, asAdmin);
    if (!NON_TERMINAL_STATUSES.includes(pickupRequest.status)) {
      throw new BadRequestException(
        `Cannot verify a pickup request that is already ${pickupRequest.status}`,
      );
    }
    if (!pickupRequest.arrivedAt) {
      throw new BadRequestException('Mark arrival before verifying the parcel');
    }
    // Customs will not clear an export without the shipper's ID, and a photo of the box is the
    // only record of what was actually handed over — both needed before any money changes hands.
    if (!pickupRequest.customer.aadhaarKey) {
      throw new BadRequestException(
        "Add the customer's Aadhaar card before verifying the parcel",
      );
    }
    if (!pickupRequest.parcelPhotoKey) {
      throw new BadRequestException(
        'Take a photo of the parcel before verifying it',
      );
    }

    // Measured at the door: priced on the greater of actual and volumetric weight, per box.
    const verifiedWeightKg = chargeableWeightKg(dto.packages);

    let verifiedPrice: number;
    // Null on the manual-quote path below, which genuinely has no breakdown to record — the
    // invoice layer treats that case separately rather than being handed zeroes.
    let breakdown: ComputedRateOption | null = null;
    if (pickupRequest.rateProviderId) {
      // Rejected, not ignored: silently dropping a price the partner typed would show them a
      // number on the phone and record a different one, which is the worst of both.
      if (dto.verifiedPrice !== undefined) {
        throw new BadRequestException(
          'This pickup is priced from its rate card — verifiedPrice cannot be set',
        );
      }
      const recalculated = await this.repriceAgainstOriginalProvider(
        pickupRequest,
        verifiedWeightKg,
        dto.verifiedShipmentType,
      );
      if (recalculated === null) {
        throw new BadRequestException(
          'No rate is available for the corrected weight/shipment type — this needs manual review',
        );
      }
      verifiedPrice = recalculated.finalPrice;
      breakdown = recalculated;
    } else {
      // No RateProvider to re-price against. Two ways to get here:
      //   - the manual-quote path, where a human already set the price with their own judgment;
      //   - an unpriced quote (no rate card covered it), which now reaches a partner instead of
      //     waiting on manual review — nobody has ever named a price for it, and estimatedPrice
      //     is 0.
      // The partner's own figure wins when they supply one, which is the whole point of pricing
      // at the door; otherwise the existing estimate stands, exactly as before.
      verifiedPrice = dto.verifiedPrice ?? pickupRequest.estimatedPrice;
    }

    // The partner confirms (or takes down) the recipient's delivery address at the door — the
    // customer may have skipped it when booking. Required at the HTTP boundary by the DTO.
    // The contents are confirmed against what is actually in the box, too.
    await this.prisma.quote.update({
      where: { id: pickupRequest.quoteId },
      data: {
        ...(dto.recipient ? recipientToQuoteData(dto.recipient) : {}),
        items: cleanItems(dto.items),
      },
    });

    await this.prisma.pickupRequest.update({
      where: { id },
      data: {
        ...(dto.recipient ? { recipientVerifiedAt: new Date() } : {}),
        verifiedWeightKg,
        verifiedPackages: cleanPackages(dto.packages),
        verifiedShipmentType: dto.verifiedShipmentType,
        verifiedPrice,
        // Frozen here because this is the one moment the charged price becomes authoritative.
        verifiedTaxableSubtotal: breakdown?.taxableSubtotal ?? null,
        verifiedGstPercent: breakdown?.gstPercent ?? null,
        verifiedGstAmount: breakdown?.gstAmount ?? null,
        verifiedNationwideCut: breakdown?.nationwideCut ?? null,
        verificationNotes: dto.verificationNotes ?? null,
        verifiedAt: new Date(),
        status: 'VERIFICATION_PENDING',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: partnerId,
        action: 'PICKUP_REQUEST_VERIFIED',
        entity: 'PickupRequest',
        entityId: id,
        before: {
          estimatedWeightKg: pickupRequest.estimatedWeightKg,
          estimatedPrice: pickupRequest.estimatedPrice,
        },
        after: { verifiedWeightKg, verifiedPrice },
      },
    });

    await this.notificationsService.enqueue(
      pickupRequest.customerId,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.PICKUP_VERIFICATION_COMPLETE,
      { verifiedPrice: String(verifiedPrice) },
    );

    return this.findOne(id);
  }

  async collectPayment(
    id: string,
    dto: CollectPaymentDto,
    partnerId: string,
    asAdmin = false,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOneForPartner(id, partnerId, asAdmin);
    if (!pickupRequest.verifiedAt) {
      throw new BadRequestException(
        'Verify the parcel before collecting payment',
      );
    }
    if (pickupRequest.paymentCollectedAt) {
      throw new BadRequestException(
        'Payment has already been collected for this pickup request',
      );
    }

    const expectedPrice =
      pickupRequest.verifiedPrice ?? pickupRequest.estimatedPrice;
    const tolerance = Math.max(
      expectedPrice * COLLECTED_AMOUNT_TOLERANCE_RATIO,
      COLLECTED_AMOUNT_TOLERANCE_FLOOR,
    );
    if (Math.abs(dto.collectedAmount - expectedPrice) > tolerance) {
      throw new BadRequestException(
        `Collected amount (${dto.collectedAmount}) is too far from the verified price ` +
          `(${expectedPrice}) — if this is legitimate, contact an admin to review and record it.`,
      );
    }

    // Atomic claim (paymentCollectedAt: null guard re-checked against the database, not the
    // in-memory read above) — without this, a double-tap or network retry could both pass the
    // check above and both record a collection, double-charging the audit trail and sending the
    // customer two "payment collected" notifications for one real payment.
    const claim = await this.prisma.pickupRequest.updateMany({
      where: { id, paymentCollectedAt: null },
      data: {
        paymentMethod: dto.paymentMethod,
        collectedAmount: dto.collectedAmount,
        paymentReference: dto.paymentReference ?? null,
        paymentNotes: dto.paymentNotes ?? null,
        paymentCollectedAt: new Date(),
      },
    });
    if (claim.count === 0) {
      throw new BadRequestException(
        'Payment has already been collected for this pickup request',
      );
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: partnerId,
        action: 'PICKUP_REQUEST_PAYMENT_COLLECTED',
        entity: 'PickupRequest',
        entityId: id,
        before: {},
        after: {
          paymentMethod: dto.paymentMethod,
          collectedAmount: dto.collectedAmount,
        },
      },
    });

    await this.notificationsService.enqueue(
      pickupRequest.customerId,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.PAYMENT_COLLECTED,
      { amount: String(dto.collectedAmount) },
    );

    return this.findOne(id);
  }

  // The terminal action — only once weight is verified, payment is collected, and the parcel
  // is accepted does the real Order/Shipment/tracking number get generated (Section: Order
  // creation sequence).
  async acceptParcel(
    id: string,
    dto: AcceptParcelDto,
    partnerId: string,
    asAdmin = false,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOneForPartner(id, partnerId, asAdmin);
    if (!NON_TERMINAL_STATUSES.includes(pickupRequest.status)) {
      throw new BadRequestException(
        `Cannot accept a pickup request that is already ${pickupRequest.status}`,
      );
    }
    if (!pickupRequest.verifiedAt) {
      throw new BadRequestException('Verify the parcel before accepting it');
    }
    if (!pickupRequest.paymentCollectedAt) {
      throw new BadRequestException(
        'Collect payment before accepting the parcel',
      );
    }

    // Atomic claim BEFORE creating the Order — without this, two concurrent accept() calls
    // (double-tap on a partner's tablet, or a network retry after a slow response) could both
    // pass every check above while the row is still e.g. VERIFICATION_PENDING, and both go on to
    // call createOrderWithShipment, producing two real Orders/Shipments/tracking numbers for one
    // pickup request. Flipping straight to COMPLETED here (ahead of the order actually existing)
    // is a deliberate tradeoff: if createOrderWithShipment throws after this claim succeeds, the
    // row is left COMPLETED with orderId still null — a detectable, admin-recoverable gap, which
    // is a far smaller blast radius than silently double-billing/double-shipping a customer.
    const claim = await this.prisma.pickupRequest.updateMany({
      where: { id, status: { in: NON_TERMINAL_STATUSES } },
      data: { status: 'COMPLETED' },
    });
    if (claim.count === 0) {
      throw new BadRequestException(
        'This pickup request was already processed',
      );
    }

    // createOrderWithShipment/createForOrder are themselves plain sequential Prisma calls (not
    // transactional) — same rigor level already used everywhere else this primitive is called
    // (see QuotesService.finalizeAcceptedQuote), so this follows the same precedent rather than
    // introducing new cross-service transaction plumbing that doesn't exist anywhere else in
    // this codebase.
    const { order, shipment } =
      await this.ordersService.createOrderWithShipment(
        pickupRequest.customerId,
      );

    const finalPrice =
      pickupRequest.verifiedPrice ?? pickupRequest.estimatedPrice;

    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'PAID',
          paymentMethod: pickupRequest.paymentMethod,
          paidAmount: pickupRequest.collectedAmount ?? finalPrice,
          paidAt: pickupRequest.paymentCollectedAt,
          paymentMarkedByAdminId: partnerId,
        },
      }),
      this.prisma.quote.update({
        where: { id: pickupRequest.quoteId },
        data: { status: 'ACCEPTED', orderId: order.id },
      }),
      this.prisma.pickupRequest.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          orderId: order.id,
          parcelPackedProperly: dto.parcelPackedProperly,
          weightVerifiedFlag: dto.weightVerifiedFlag,
          restrictedItemsChecked: dto.restrictedItemsChecked,
          documentsVerified: dto.documentsVerified,
          isFragile: dto.isFragile,
          insuranceRequired: dto.insuranceRequired,
          acceptanceRemarks: dto.acceptanceRemarks ?? null,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: partnerId,
          action: 'PICKUP_REQUEST_ACCEPTED',
          entity: 'PickupRequest',
          entityId: id,
          before: { status: pickupRequest.status },
          after: { status: 'COMPLETED', orderId: order.id },
        },
      }),
    ]);

    // The partner has just taken the money at the door, so the order is created already PAID —
    // which means this path owes the customer the same two documents the admin path raises when
    // it marks a payment. Without this, every partner-collected order stayed permanently
    // unbilled, which the bulk "generate invoices" screen used to paper over.
    //
    // After the transaction, and each swallowing its own failure: the payment and the order are
    // committed facts, and neither may be rolled back because a PDF failed to render or the
    // company's GSTIN is not filled in yet. Both calls are idempotent, so the admin screens
    // remain the retry path.
    try {
      await this.invoicesService.generateForOrder(order.id, partnerId);
    } catch (error) {
      this.logger.warn(
        `Order ${order.id} was created paid from pickup ${id} but could not be invoiced: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    await this.receiptsService.issueAndSendQuietly(order.id, partnerId);

    // Enqueue after commit — BullMQ has no rollback semantics, matching PickupsService.
    // updateStatus's existing "write DB state, then enqueue" pattern.
    await this.notificationsService.enqueue(
      pickupRequest.customerId,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.ORDER_CREATED_FROM_PICKUP,
      { trackingNumber: shipment.internalTrackingNumber },
    );

    return this.findOne(id);
  }

  async rejectParcel(
    id: string,
    dto: RejectParcelDto,
    partnerId: string,
    asAdmin = false,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOneForPartner(id, partnerId, asAdmin);
    if (!NON_TERMINAL_STATUSES.includes(pickupRequest.status)) {
      throw new BadRequestException(
        `Cannot reject a pickup request that is already ${pickupRequest.status}`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.pickupRequest.update({
        where: { id },
        data: { status: 'REJECTED', rejectionReason: dto.reason },
      }),
      this.prisma.quote.update({
        where: { id: pickupRequest.quoteId },
        data: { status: 'REJECTED', rejectionReason: dto.reason },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: partnerId,
          action: 'PICKUP_REQUEST_REJECTED',
          entity: 'PickupRequest',
          entityId: id,
          before: { status: pickupRequest.status },
          after: { status: 'REJECTED', reason: dto.reason },
        },
      }),
    ]);

    await this.notificationsService.enqueue(
      pickupRequest.customerId,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.PICKUP_REJECTED,
      { reason: dto.reason },
    );

    return this.findOne(id);
  }

  /**
   * The customer's Aadhaar card, photographed at the door. Stored on the customer, not the pickup,
   * so their next pickup reuses it; uploading again replaces it (and deletes the old photo).
   */
  async saveAadhaar(
    id: string,
    file: Express.Multer.File,
    actorId: string,
    asAdmin = false,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOneWorkable(id, actorId, asAdmin);
    const previousKey = pickupRequest.customer.aadhaarKey;
    const key = `kyc/aadhaar/${pickupRequest.customerId}/${randomUUID()}.${IMAGE_EXTENSIONS[file.mimetype]}`;
    await this.storage.put(key, file.buffer, file.mimetype);
    await this.prisma.customer.update({
      where: { id: pickupRequest.customerId },
      data: { aadhaarKey: key, aadhaarUploadedAt: new Date() },
    });
    if (previousKey) await this.storage.delete(previousKey);
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: previousKey
          ? 'CUSTOMER_AADHAAR_REPLACED'
          : 'CUSTOMER_AADHAAR_ADDED',
        entity: 'Customer',
        entityId: pickupRequest.customerId,
        // Which pickup it was taken on — never the document or its key.
        after: { pickupRequestId: id },
      },
    });
    return this.findOne(id);
  }

  async saveParcelPhoto(
    id: string,
    file: Express.Multer.File,
    actorId: string,
    asAdmin = false,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOneWorkable(id, actorId, asAdmin);
    const key = `pickups/${id}/parcel-${randomUUID()}.${IMAGE_EXTENSIONS[file.mimetype]}`;
    await this.storage.put(key, file.buffer, file.mimetype);
    await this.prisma.pickupRequest.update({
      where: { id },
      data: { parcelPhotoKey: key },
    });
    if (pickupRequest.parcelPhotoKey) {
      await this.storage.delete(pickupRequest.parcelPhotoKey);
    }
    return this.findOne(id);
  }

  /**
   * Five-minute links to the photos. A partner gets them only on a pickup assigned to them (never
   * on an open request they are just browsing); staff get them on any.
   */
  async documents(
    id: string,
    viewerId: string,
    asAdmin = false,
  ): Promise<PickupDocumentsDto> {
    const pickupRequest = asAdmin
      ? await this.findOne(id)
      : await this.findOneForPartner(id, viewerId);
    const sign = (key: string | null) =>
      key && this.storage.isConfigured
        ? this.storage.presignGet(key, 300).catch(() => null)
        : Promise.resolve(null);
    const [aadhaarUrl, parcelPhotoUrl] = await Promise.all([
      sign(pickupRequest.customer.aadhaarKey),
      sign(pickupRequest.parcelPhotoKey),
    ]);
    return { aadhaarUrl, parcelPhotoUrl };
  }

  /** One-shot position report from the partner app, shown to staff assigning a pickup by hand. */
  async updatePartnerLocation(
    partnerId: string,
    latitude: number,
    longitude: number,
  ): Promise<void> {
    await this.prisma.adminUser.update({
      where: { id: partnerId },
      data: {
        lastLatitude: latitude,
        lastLongitude: longitude,
        locationUpdatedAt: new Date(),
      },
    });
  }

  // Photos are only taken on a live pickup the actor is working, once they are at the door.
  private async findOneWorkable(
    id: string,
    actorId: string,
    asAdmin: boolean,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOneForPartner(id, actorId, asAdmin);
    if (!NON_TERMINAL_STATUSES.includes(pickupRequest.status)) {
      throw new BadRequestException(
        `Cannot update a pickup request that is already ${pickupRequest.status}`,
      );
    }
    if (!pickupRequest.arrivedAt) {
      throw new BadRequestException('Mark arrival before adding photos');
    }
    return pickupRequest;
  }

  async getDashboardSummary(partnerId: string) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 2);

    const [
      todayPickups,
      tomorrowPickups,
      pendingPickups,
      completedToday,
      paymentsToday,
    ] = await Promise.all([
      this.prisma.pickupRequest.count({
        where: { assignedPartnerId: partnerId, pickupDate: today },
      }),
      this.prisma.pickupRequest.count({
        where: { assignedPartnerId: partnerId, pickupDate: tomorrow },
      }),
      this.prisma.pickupRequest.count({
        where: {
          assignedPartnerId: partnerId,
          status: { in: NON_TERMINAL_STATUSES },
        },
      }),
      this.prisma.pickupRequest.count({
        where: {
          assignedPartnerId: partnerId,
          status: 'COMPLETED',
          updatedAt: { gte: today, lt: tomorrow },
        },
      }),
      this.prisma.pickupRequest.findMany({
        where: {
          assignedPartnerId: partnerId,
          paymentCollectedAt: { gte: today, lt: tomorrow },
        },
        select: { paymentMethod: true, collectedAmount: true },
      }),
    ]);

    const cashCollectedToday = paymentsToday
      .filter((p) => p.paymentMethod === 'CASH')
      .reduce((sum, p) => sum + (p.collectedAmount ?? 0), 0);
    const upiCollectedToday = paymentsToday
      .filter((p) => p.paymentMethod === 'UPI')
      .reduce((sum, p) => sum + (p.collectedAmount ?? 0), 0);

    return {
      todayPickups,
      tomorrowPickups,
      pendingPickups,
      completedToday,
      collectionsToday: paymentsToday.length,
      cashCollectedToday,
      upiCollectedToday,
      totalStops: pendingPickups,
    };
  }

  // Shared by recalculate() (preview) and verify() (persist) — filters the pricing engine's
  // fresh options for the specific carrier the customer originally selected, since a Pickup
  // Partner correcting weight should never silently switch carriers.
  // Returns the engine's WHOLE option, not just finalPrice. It used to return the total alone
  // and discard the 7-step breakdown that produced it — which meant that once a parcel was
  // verified, nothing anywhere recorded how much of the charged price was tax. Invoicing needs
  // exactly that, and re-deriving it later would re-price against whatever the rate cards say
  // then, not what the customer actually paid. Callers that only want the total read .finalPrice.
  private async repriceAgainstOriginalProvider(
    pickupRequest: PickupRequestWithDetails,
    weightKg: number,
    shipmentType: RecalculateWeightDto['shipmentType'],
  ): Promise<ComputedRateOption | null> {
    if (!pickupRequest.rateProviderId) return null;
    const options = await this.pricingEngineService.computeQuotesForRequest({
      destinationCountryName: pickupRequest.quote.destCountry,
      weightKg,
      shipmentType,
    });
    return (
      options.find((o) => o.rateProviderId === pickupRequest.rateProviderId) ??
      null
    );
  }
}
