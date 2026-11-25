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
  isPickupSlotOpen,
  localDateIso,
  MAX_PHOTOS_PER_KIND,
  kycNumberProblem,
  normalizeKycNumber,
  type B2bOrderResultDto,
  type PaymentMethodCode,
  type PaymentSplitDto,
  type PickupPhotoKind,
  type B2bRequestSummaryDto,
  type PaymentUpiDto,
  type PickupDocumentsDto,
  type PickupRequestStatusCode,
  type PriceChangeDto,
  type RecalculatePreviewDto,
  type ShipmentTypeCode,
} from '@nationwide/shared-types';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../database/storage.service';
import { publicFrontendUrl } from '../../common/config/public-urls';
import { cleanItems, cleanPackages } from '../../common/dto/parcel.dto';
import { AddressBookService } from '../customers/address-book.service';
import { QuotesService } from '../quotes/quotes.service';
import { OrdersService } from '../orders/orders.service';
import { InvoicesService } from '../invoices/invoices.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { PushService } from '../push/push.service';
import { ReschedulePickupDto } from './dto/reschedule-pickup.dto';
import { UpdatePickupAddressDto } from './dto/update-pickup-address.dto';
import {
  PricingEngineService,
  type ComputedRateOption,
} from '../pricing/pricing-engine.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TEMPLATES } from '../notifications/templates';
import { round2 } from '../invoices/gst';
import { CouponsService } from '../coupons/coupons.service';
import { CreatePickupRequestDto } from './dto/create-pickup-request.dto';
import { QueryPickupRequestsDto } from './dto/query-pickup-requests.dto';
import { RecalculateWeightDto } from './dto/recalculate-weight.dto';
import { VerifyPickupRequestDto } from './dto/verify-pickup-request.dto';
import { CollectPaymentDto } from './dto/collect-payment.dto';
import { DoorDiscountDto } from './dto/door-discount.dto';
import { AcceptParcelDto } from './dto/accept-parcel.dto';
import { RejectParcelDto } from './dto/reject-parcel.dto';
import { RecipientAddressDto } from './dto/recipient-address.dto';
import { AdminCreatePickupOrderDto } from './dto/admin-create-pickup-order.dto';
import {
  B2bCreateOrdersDto,
  B2bOrderDto,
  BookableOrderDto,
} from './dto/b2b-create-orders.dto';
import { resolveMapsUrl } from './maps-url';
import { compressPhoto } from './image-upload';
import { KycDocumentDto } from './dto/pickup-photos.dto';

// What a photo row carries out to the app. The S3 key stays in the database; see documents().
const photoSummary = {
  select: { id: true, kind: true, label: true, createdAt: true },
  orderBy: { createdAt: 'asc' },
} as const;

const withDetails = {
  include: {
    customer: {
      select: {
        name: true,
        phone: true,
        kycDocumentType: true,
        kycDocumentNumber: true,
        // The customer's own: taken on an earlier pickup, they carry over to this one.
        photos: { where: { kind: 'KYC' as const }, ...photoSummary },
      },
    },
    // The pickup's own photos: the parcel, and any proof of payment. Split by kind in the mapper.
    photos: {
      where: { kind: { in: ['PARCEL' as const, 'PAYMENT' as const] } },
      ...photoSummary,
    },
    assignedPartner: {
      select: { id: true, name: true, email: true, phone: true },
    },
    // Named on the pickup and on the customer's order: who let this parcel go unpaid.
    paymentDueApprovedBy: { select: { name: true } },
    // Named on the pickup and the receipt: who let the partner take money off at the door.
    doorDiscountApprovedBy: { select: { name: true, email: true } },
    // The code the customer applied when booking — shown to them, to the partner at the door,
    // and printed on the invoice.
    coupon: { select: { code: true } },
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
        shipmentType: true,
        weightKg: true,
        // The breakdown as it stood when the customer was quoted. Re-pricing at the door uses
        // today's rate card, so this is the only record of what they were originally told —
        // and the only way to say WHY the figure moved.
        selectedOption: true,
      },
    },
  },
};
export type PickupRequestWithDetails = Prisma.PickupRequestGetPayload<
  typeof withDetails
>;

const rupees = (value: number) => `₹${value.toLocaleString('en-IN')}`;
const percent = (value: number) => `${value}%`;

/**
 * Why the price at the door differs from the quote.
 *
 * The reprice deliberately runs against TODAY's rate card (see repriceAgainstOriginalProvider),
 * so an edit to a tariff, fuel % or PSS after the quote moves the figure even for a parcel that
 * is exactly as described. Comparing the quote's own stored breakdown against the fresh one is
 * the only way to say which of those it was — without it the partner is left telling the
 * customer "the system says so".
 *
 * Returns nothing when the quote has no stored breakdown (a manual/admin-priced quote), which is
 * honest: there is no earlier breakdown to compare against, so no reason can be given.
 */
function explainPriceChange(
  pickupRequest: PickupRequestWithDetails,
  fresh: ComputedRateOption,
  weightKg: number,
  shipmentType: ShipmentTypeCode,
): PriceChangeDto[] {
  const quoted = pickupRequest.quote.selectedOption;
  const changes: PriceChangeDto[] = [];

  // The parcel itself first: these are the partner's own measurements, and the likeliest cause.
  if (
    pickupRequest.quote.weightKg != null &&
    pickupRequest.quote.weightKg !== weightKg
  ) {
    changes.push({
      label: 'Chargeable weight',
      from: `${pickupRequest.quote.weightKg} kg`,
      to: `${weightKg} kg`,
    });
  }
  if (
    pickupRequest.quote.shipmentType &&
    pickupRequest.quote.shipmentType !== shipmentType
  ) {
    changes.push({
      label: 'Shipment type',
      from: pickupRequest.quote.shipmentType,
      to: shipmentType,
    });
  }

  if (!quoted) return changes;

  if (quoted.baseRate !== fresh.baseRate) {
    changes.push({
      label: 'Carrier base rate',
      from: rupees(quoted.baseRate),
      to: rupees(fresh.baseRate),
    });
  }
  if (quoted.fuelChargePercent !== fresh.fuelChargePercent) {
    changes.push({
      label: 'Fuel surcharge',
      from: percent(quoted.fuelChargePercent),
      to: percent(fresh.fuelChargePercent),
    });
  }
  if (quoted.pssAmount !== fresh.pssAmount) {
    changes.push({
      label: 'Peak season surcharge',
      from: rupees(quoted.pssAmount),
      to: rupees(fresh.pssAmount),
    });
  }
  if (quoted.gstPercent !== fresh.gstPercent) {
    changes.push({
      label: 'GST',
      from: percent(quoted.gstPercent),
      to: percent(fresh.gstPercent),
    });
  }
  if (quoted.nationwideCut !== fresh.nationwideCut) {
    changes.push({
      label: 'Handling charge',
      from: rupees(quoted.nationwideCut),
      to: rupees(fresh.nationwideCut),
    });
  }

  return changes;
}

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
    private readonly config: ConfigService,
    // Discount codes a customer applies when booking; redeemed when the money is taken.
    private readonly coupons: CouponsService,
  ) {}

  /**
   * What the customer actually pays: the priced amount, less any coupon applied at booking and
   * any discount the partner gave at the door.
   */
  private payableFor(pickupRequest: {
    verifiedPrice: number | null;
    estimatedPrice: number;
    discountAmount: number | null;
    doorDiscountAmount: number | null;
  }): number {
    const price = pickupRequest.verifiedPrice ?? pickupRequest.estimatedPrice;
    return round2(
      Math.max(
        0,
        price -
          (pickupRequest.discountAmount ?? 0) -
          (pickupRequest.doorDiscountAmount ?? 0),
      ),
    );
  }

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
    // The browser greys out a window that has already ended, but a form left open through lunch
    // would still post the morning slot — and nobody can be collected in a window that is over.
    // Scoped to today on purpose: whether a past DATE is bookable is a separate rule, and not
    // one to change from here.
    const pickupDay = dto.pickupDate?.slice(0, 10);
    if (
      !dto.dropAtWarehouse &&
      dto.pickupTimeSlot &&
      pickupDay === localDateIso() &&
      !isPickupSlotOpen(dto.pickupTimeSlot, pickupDay)
    ) {
      throw new BadRequestException(
        `The ${dto.pickupTimeSlot} slot has already closed — choose a later slot or another day`,
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

    // Validated now so a bad code is refused while the customer is still looking at the form,
    // but NOT redeemed — the redemption is claimed when the money is actually taken, so an
    // abandoned booking does not burn a limited code.
    const coupon = dto.couponCode
      ? await this.coupons.validate(dto.couponCode)
      : null;
    // Frozen at booking: the code can be retired or re-priced before the parcel is collected,
    // and this is the figure the customer was shown. Never more than the price itself.
    // A route priced at the door has no price yet (0): the full amount is kept, and payableFor
    // never lets it take the bill below zero once the partner has weighed the parcel.
    const discountAmount = coupon
      ? estimatedPrice > 0
        ? Math.min(coupon.discountAmount, estimatedPrice)
        : coupon.discountAmount
      : null;

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
          couponId: coupon?.id ?? null,
          discountAmount,
          ...pickupLogisticsData(dto),
        },
      });
    });

    await this.addressBook.remember(customerId, dto.items);

    await this.notificationsService.enqueue(
      customerId,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.PICKUP_REQUEST_RECEIVED,
      { termsUrl: `${publicFrontendUrl(this.config)}/terms` },
    );

    // Partners never pick requests up themselves: the request waits, PENDING_ASSIGNMENT, on the
    // admin Pickup Assignments page until staff hand it to one. Warehouse drop-offs are handled
    // by admin at the warehouse, so there is nothing to assign.
    const full = await this.findOne(created.id);
    if (!dto.dropAtWarehouse) await this.notifyAdminsToAssign(full);
    return full;
  }

  /**
   * The one place a priced quote becomes a pickup request: claims the quote (atomically, so a
   * retried submit cannot book it twice) and creates the pickup in the same transaction. Shared by
   * staff booking (assigned to a chosen partner) and the B2B portal (left for staff to assign).
   */
  private async commitBooking(params: {
    quote: { id: string; status: string; weightKg: number };
    customerId: string;
    shipmentType: B2bOrderDto['shipmentType'];
    /** Missing on a staff booking: the partner takes it down at the door. */
    recipient?: RecipientAddressDto;
    items: B2bOrderDto['items'];
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
          ...(params.recipient ? recipientToQuoteData(params.recipient) : {}),
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

  /**
   * The UPI ID customers pay into, from the active company settings: the partner's phone and the
   * warehouse counter draw the QR from it with the amount filled in.
   */
  async paymentUpi(): Promise<PaymentUpiDto> {
    const settings = await this.prisma.companySettings.findFirst({
      where: { isActive: true },
      select: { upiId: true, upiPayeeName: true, companyName: true },
    });
    return {
      upiId: settings?.upiId ?? null,
      payeeName: settings?.upiPayeeName || settings?.companyName || null,
    };
  }

  /**
   * The admins a partner may name as having approved a "pay later" at the door.
   *
   * Names and ids only. A partner rings an admin from the doorstep and has to record who said
   * yes; without a list they would be typing a name into free text, which is not something the
   * finance screens could ever hold anyone to.
   */
  async listDueApprovers(): Promise<{ id: string; name: string }[]> {
    const admins = await this.prisma.adminUser.findMany({
      where: { isActive: true, role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
    // name is nullable on AdminUser; an admin with none is still someone a partner has to be
    // able to point at, so they are listed by the address they sign in with.
    return admins.map((admin) => ({
      id: admin.id,
      name: admin.name ?? admin.email,
    }));
  }

  // A new request waits for staff to choose a partner; this tells them it is there.
  private async notifyAdminsToAssign(
    pickupRequest: PickupRequestWithDetails,
  ): Promise<void> {
    const admins = await this.prisma.adminUser.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true },
      select: { id: true },
    });
    for (const admin of admins) {
      void this.pushService.sendToAdminUser(admin.id, {
        title: 'Pickup request to assign',
        body: [
          pickupRequest.pickupContactName,
          pickupRequest.pickupCity,
          pickupRequest.pickupTimeSlot,
        ]
          .filter(Boolean)
          .join(' · '),
        url: '/admin/pickup-assignments',
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
   * A shipment no rate card covers is NOT sent for assignment: its quote is left for an admin to price, the
   * same rule QuotesService.create applies to a customer's own unpriced quote. The caller is told
   * per shipment which happened.
   */
  async createBatchForCustomer(
    customerId: string,
    // The portal's shape, or staff's, whose recipient may be missing.
    dto: Omit<B2bCreateOrdersDto, 'orders'> & { orders: BookableOrderDto[] },
    opts: { partnerId?: string; actorId?: string } = {},
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

      const manualPrice = (order as { manualPrice?: number }).manualPrice;
      if (
        quote.status !== 'RATED' &&
        manualPrice !== undefined &&
        opts.actorId
      ) {
        // Staff named a price for a route no rate card covers — the escape hatch the portal
        // deliberately does not have.
        const created = await this.commitBooking({
          quote,
          customerId,
          shipmentType: order.shipmentType,
          recipient: order.recipient,
          items: order.items,
          logistics,
          pricing: {
            rateProviderId: null,
            rateProviderName: null,
            estimatedPrice: manualPrice,
            currency: 'INR',
            quote: {
              quotedAmount: manualPrice,
              quotedCurrency: 'INR',
              quotedByAdminId: opts.actorId,
              quotedAt: new Date(),
            },
          },
          partnerId: opts.partnerId,
        });
        booked.push(created);
        results.push(this.toOrderResult(index, order, created));
        await this.addressBook.remember(customerId, order.items);
        continue;
      }

      if (quote.status !== 'RATED') {
        // No rate card covers this route/weight. An admin prices it and the customer is contacted;
        // nothing is dispatched on a price nobody has set.
        results.push({
          index,
          recipientName: order.recipient?.name ?? '',
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
        partnerId: opts.partnerId,
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
        { termsUrl: `${publicFrontendUrl(this.config)}/terms` },
      );
      for (const pickupRequest of booked) {
        if (opts.partnerId) {
          await this.announceAssignment(pickupRequest, opts.partnerId);
        } else {
          await this.notifyAdminsToAssign(pickupRequest);
        }
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
      include: {
        ...withDetails.include,
        // The tracking number only exists once acceptParcel has generated the Order, so this is
        // null for anything still awaiting pickup — the portal shows those without a track link.
        order: {
          select: {
            shipments: {
              select: { internalTrackingNumber: true, currentStatus: true },
              take: 1,
            },
          },
        },
      },
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
      trackingNumber: r.order?.shipments[0]?.internalTrackingNumber ?? null,
      shipmentStatus: r.order?.shipments[0]?.currentStatus ?? null,
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
    order: BookableOrderDto,
    pickupRequest: PickupRequestWithDetails,
  ): B2bOrderResultDto {
    return {
      index,
      recipientName: order.recipient?.name ?? '',
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
   * Staff booking for a customer (a phone-in or walk-in), handed straight to a partner of their
   * choosing — no broadcast. The same path the portal uses, so staff and customers cannot drift
   * apart; the only differences are the assigned partner and the staff-set price.
   */
  async createForAdmin(
    dto: AdminCreatePickupOrderDto,
    actorId: string,
  ): Promise<B2bOrderResultDto[]> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
      select: { id: true, name: true, phone: true },
    });
    if (!customer) {
      throw new NotFoundException(`Customer ${dto.customerId} not found`);
    }

    // The customer brings it in: no partner, no address, weighed and priced at the counter.
    if (dto.dropAtWarehouse) {
      if (dto.orders?.length) {
        throw new BadRequestException(
          'A warehouse drop-off is weighed at the counter: leave out the parcel details',
        );
      }
      return [
        await this.dispatchForAdmin(dto, actorId, {
          dropAtWarehouse: true,
          pickupContactName: customer.name,
          pickupContactPhone: customer.phone,
        }),
      ];
    }

    // The DTO requires both unless dropAtWarehouse; narrowed here for the compiler.
    const partnerId = dto.partnerId;
    const pickup = dto.pickup;
    if (!partnerId || !pickup) {
      throw new BadRequestException('Choose the pickup address and partner');
    }
    const partner = await this.prisma.adminUser.findUnique({
      where: { id: partnerId },
    });
    if (!partner || partner.role !== 'PICKUP_PARTNER' || !partner.isActive) {
      throw new NotFoundException(`Pickup partner ${partnerId} not found`);
    }

    if (!dto.orders?.length) {
      // A pasted short link carries no coordinates until expanded.
      let { pickupLatitude, pickupLongitude } = pickup;
      if (pickupLatitude == null && pickup.pickupMapsUrl) {
        const resolved = await resolveMapsUrl(pickup.pickupMapsUrl);
        pickupLatitude = resolved?.latitude;
        pickupLongitude = resolved?.longitude;
      }
      return [
        await this.dispatchForAdmin(
          dto,
          actorId,
          {
            ...pickup,
            dropAtWarehouse: false,
            pickupLatitude,
            pickupLongitude,
          },
          partnerId,
        ),
      ];
    }
    return this.createBatchForCustomer(
      dto.customerId,
      { ...dto, pickup, orders: dto.orders },
      { partnerId, actorId },
    );
  }

  /**
   * The carriers that ship to a country: those whose zones list it (or, for a region such as
   * "Azores (Portugal)", its parent country). Staff choose one when they already know the
   * destination; the rate card then prices the parcel at the door.
   */
  async carriersForCountry(
    countryName: string,
  ): Promise<{ id: string; name: string }[]> {
    const country = await this.prisma.country.findFirst({
      where: {
        isActive: true,
        name: { equals: countryName.trim(), mode: 'insensitive' },
      },
      select: { code: true },
    });
    if (!country) return [];
    const codes = country.code.includes('-')
      ? [country.code, country.code.split('-')[0]]
      : [country.code];
    const zones = await this.prisma.zoneCountry.findMany({
      where: {
        country: { isActive: true, code: { in: codes } },
        rateProvider: { isActive: true },
      },
      select: { rateProvider: { select: { id: true, name: true } } },
    });
    const carriers = new Map(
      zones.map((z) => [z.rateProvider.id, z.rateProvider.name]),
    );
    return [...carriers]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Staff book a parcel with nothing known yet but who and where it is going. Either a partner
   * collects it (partnerId) or the customer brings it to the warehouse (logistics.dropAtWarehouse)
   * and staff work it at the counter. Whoever weighs it takes the recipient, boxes and contents;
   * with a carrier chosen the price follows from its rate card, without one they name it.
   */
  private async dispatchForAdmin(
    dto: AdminCreatePickupOrderDto,
    actorId: string,
    logistics: PickupLogistics,
    partnerId?: string,
  ): Promise<B2bOrderResultDto> {
    // A retried submit returns the pickup it already made.
    const existingQuote = await this.prisma.quote.findFirst({
      where: { customerId: dto.customerId, submissionKey: dto.submissionKey },
      select: { id: true },
    });
    const existing = existingQuote
      ? await this.prisma.pickupRequest.findUnique({
          where: { quoteId: existingQuote.id },
          ...withDetails,
        })
      : null;

    // Staff may already know where it is going and by which carrier. The carrier has to ship
    // there: a carrier with no zone for the country could never price the parcel.
    const destinationCountry = dto.destinationCountry?.trim() ?? '';
    let carrier: { id: string; name: string } | null = null;
    if (dto.rateProviderId) {
      if (!destinationCountry) {
        throw new BadRequestException(
          'Choose the destination country before the carrier',
        );
      }
      carrier =
        (await this.carriersForCountry(destinationCountry)).find(
          (c) => c.id === dto.rateProviderId,
        ) ?? null;
      if (!carrier) {
        throw new BadRequestException(
          `That carrier does not ship to ${destinationCountry}`,
        );
      }
    }

    let pickupRequest = existing;
    if (!pickupRequest) {
      pickupRequest = await this.prisma.$transaction(async (tx) => {
        const quote = await tx.quote.create({
          data: {
            customerId: dto.customerId,
            shipmentType: 'PACKAGE',
            weightKg: 0,
            // Taken at the door (verify sets it) unless staff gave it.
            destCountry: destinationCountry,
            destPostalCode: dto.destinationPostalCode?.trim() || null,
            destCity: dto.destinationCity?.trim() || null,
            destState: dto.destinationState?.trim() || null,
            status: 'PICKUP_REQUESTED',
            submissionKey: dto.submissionKey,
          },
        });
        return tx.pickupRequest.create({
          data: {
            quoteId: quote.id,
            customerId: dto.customerId,
            // With a carrier, the door price comes from its rate card (verify reprices against
            // it); without one, the partner names the price.
            rateProviderId: carrier?.id ?? null,
            rateProviderName: carrier?.name ?? null,
            shipmentType: 'PACKAGE',
            estimatedWeightKg: 0,
            estimatedPrice: 0,
            currency: 'INR',
            ...pickupLogisticsData(logistics),
            // A drop-off stays PENDING_ASSIGNMENT like a customer's own: nobody is sent out.
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
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action: partnerId
            ? 'PICKUP_REQUEST_DISPATCHED'
            : 'WAREHOUSE_DROPOFF_BOOKED',
          entity: 'PickupRequest',
          entityId: pickupRequest.id,
          before: {},
          after: {
            partnerId: partnerId ?? null,
            customerId: dto.customerId,
            destinationCountry: destinationCountry || null,
            rateProviderId: carrier?.id ?? null,
          },
        },
      });
      await this.notificationsService.enqueue(
        dto.customerId,
        'WHATSAPP',
        NOTIFICATION_TEMPLATES.PICKUP_REQUEST_RECEIVED,
        { termsUrl: `${publicFrontendUrl(this.config)}/terms` },
      );
      if (partnerId) await this.announceAssignment(pickupRequest, partnerId);
    }

    return {
      index: 0,
      recipientName: '',
      destinationCountry: pickupRequest.quote.destCountry,
      status: 'BOOKED',
      quoteId: pickupRequest.quoteId,
      pickupRequestId: pickupRequest.id,
      carrier: pickupRequest.rateProviderName,
      price: null,
      currency: 'INR',
    };
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
        // A new partner has not said yes yet, whatever the last one did.
        acceptedAt: null,
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

  /**
   * The partner says they will do an assigned pickup on the day and slot it has. Before this they
   * may move it instead (reschedule); after it, only staff can.
   */
  async acceptAssignment(
    id: string,
    partnerId: string,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOneForPartner(id, partnerId);
    if (pickupRequest.status === 'SCHEDULED') return pickupRequest;
    if (pickupRequest.status !== 'ASSIGNED') {
      throw new BadRequestException(
        `Only a newly assigned pickup can be accepted (this one is ${pickupRequest.status})`,
      );
    }
    const claim = await this.prisma.pickupRequest.updateMany({
      where: { id, assignedPartnerId: partnerId, status: 'ASSIGNED' },
      data: { status: 'SCHEDULED', acceptedAt: new Date() },
    });
    if (claim.count === 1) {
      await this.prisma.auditLog.create({
        data: {
          actorId: partnerId,
          action: 'PICKUP_REQUEST_ACCEPTED',
          entity: 'PickupRequest',
          entityId: id,
          before: { status: 'ASSIGNED' },
          after: { status: 'SCHEDULED' },
        },
      });
    }
    return this.findOne(id);
  }

  /**
   * Move a pickup to another day or slot, with the reason the customer is told.
   *
   * The partner may do it only before accepting: it is their answer to "can you do this one?".
   * Moving it counts as accepting the new time, so it does not come back to them to accept again.
   * Staff may move any pickup nobody has reached yet; a partner who had accepted the old time is
   * asked again, because they agreed to a different one.
   */
  async reschedule(
    id: string,
    dto: ReschedulePickupDto,
    actorId: string,
    asAdmin = false,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = asAdmin
      ? await this.findOne(id)
      : await this.findOneForPartner(id, actorId);
    if (pickupRequest.dropAtWarehouse) {
      throw new BadRequestException(
        'A warehouse drop-off has no pickup slot to move',
      );
    }
    if (pickupRequest.arrivedAt) {
      throw new BadRequestException(
        'The partner is already at the pickup, so it can no longer be moved',
      );
    }
    const movable: PickupRequestStatusCode[] = asAdmin
      ? ['PENDING_ASSIGNMENT', 'ASSIGNED', 'SCHEDULED']
      : ['ASSIGNED'];
    if (!movable.includes(pickupRequest.status)) {
      throw new BadRequestException(
        asAdmin
          ? `A pickup that is ${pickupRequest.status} cannot be moved`
          : 'You have already accepted this pickup. Ask the office to move it.',
      );
    }

    const day = dto.pickupDate.slice(0, 10);
    const reason = dto.reason.trim();
    if (day < localDateIso()) {
      throw new BadRequestException('Choose today or a later day');
    }
    if (day === localDateIso() && !isPickupSlotOpen(dto.pickupTimeSlot, day)) {
      throw new BadRequestException(
        `The ${dto.pickupTimeSlot} slot has already closed today. Choose a later slot or another day.`,
      );
    }

    const now = new Date();
    let nextStatus: PickupRequestStatusCode = 'SCHEDULED';
    if (asAdmin) {
      nextStatus = pickupRequest.assignedPartnerId
        ? 'ASSIGNED'
        : 'PENDING_ASSIGNMENT';
    }
    await this.prisma.pickupRequest.update({
      where: { id },
      data: {
        pickupDate: new Date(day),
        pickupTimeSlot: dto.pickupTimeSlot,
        rescheduledAt: now,
        rescheduleReason: reason,
        status: nextStatus,
        acceptedAt: asAdmin ? null : now,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'PICKUP_REQUEST_RESCHEDULED',
        entity: 'PickupRequest',
        entityId: id,
        before: {
          pickupDate:
            pickupRequest.pickupDate?.toISOString().slice(0, 10) ?? null,
          pickupTimeSlot: pickupRequest.pickupTimeSlot,
          status: pickupRequest.status,
        },
        after: {
          pickupDate: day,
          pickupTimeSlot: dto.pickupTimeSlot,
          status: nextStatus,
          reason,
          by: asAdmin ? 'ADMIN' : 'PARTNER',
        },
      },
    });

    await this.notificationsService.enqueue(
      pickupRequest.customerId,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.PICKUP_RESCHEDULED,
      { pickupDate: day, pickupTimeSlot: dto.pickupTimeSlot, reason },
    );

    const when = `${day} · ${dto.pickupTimeSlot}`;
    if (asAdmin) {
      if (pickupRequest.assignedPartnerId) {
        void this.pushService.sendToAdminUser(pickupRequest.assignedPartnerId, {
          title: 'Pickup moved: please accept again',
          body: `${pickupRequest.pickupContactName} · ${when}`,
          url: `/partner/pickups/${id}`,
          tag: `pickup-${id}`,
        });
      }
    } else {
      // Staff need to know a partner moved a pickup: the customer may call them about it.
      await this.pushToAdmins({
        title: 'Partner rescheduled a pickup',
        body: `${pickupRequest.pickupContactName} · ${when} · ${reason}`,
        url: `/admin/pickup-requests/${id}`,
        tag: `pickup-${id}`,
      });
    }
    return this.findOne(id);
  }

  /**
   * Staff call a pickup off before any money has been taken. The quote is closed with it, and the
   * customer and the partner (if one was on it) are told. A coupon on it was never redeemed (that
   * happens with the payment), so there is nothing to give back.
   */
  async cancel(
    id: string,
    reason: string,
    actorId: string,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOne(id);
    this.assertCancellable(pickupRequest);
    const why = reason.trim();

    const claimed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.pickupRequest.updateMany({
        where: {
          id,
          status: { in: NON_TERMINAL_STATUSES },
          paymentCollectedAt: null,
          paymentDeferredAt: null,
          orderId: null,
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: why,
        },
      });
      if (updated.count === 1) {
        await tx.quote.update({
          where: { id: pickupRequest.quoteId },
          data: { status: 'CANCELLED' },
        });
      }
      return updated.count === 1;
    });
    if (!claimed) {
      throw new BadRequestException(
        'This pickup changed while you were looking at it. Reload and try again.',
      );
    }

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'PICKUP_REQUEST_CANCELLED',
        entity: 'PickupRequest',
        entityId: id,
        before: { status: pickupRequest.status },
        after: { status: 'CANCELLED', reason: why },
      },
    });
    await this.announceCancellation(pickupRequest, why);
    return this.findOne(id);
  }

  /**
   * Remove a pickup request for good: a duplicate, a test, a booking made by mistake. Only one no
   * money, photo or order ever touched; anything further along is cancelled instead, so its
   * history stays. The quote is kept and closed, and the audit log keeps what was deleted.
   */
  async remove(id: string, actorId: string): Promise<void> {
    const pickupRequest = await this.findOne(id);
    if (
      pickupRequest.orderId ||
      pickupRequest.paymentCollectedAt ||
      pickupRequest.paymentDeferredAt ||
      pickupRequest.arrivedAt
    ) {
      throw new BadRequestException(
        'This pickup has already been worked on, so it can only be cancelled, not deleted',
      );
    }
    const [photos, receipts] = await Promise.all([
      this.prisma.pickupPhoto.count({ where: { pickupRequestId: id } }),
      this.prisma.receipt.count({ where: { pickupRequestId: id } }),
    ]);
    if (photos + receipts > 0) {
      throw new BadRequestException(
        'This pickup has photos or receipts on file, so it can only be cancelled, not deleted',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.pickupRequest.delete({ where: { id } });
      await tx.quote.update({
        where: { id: pickupRequest.quoteId },
        data: { status: 'CANCELLED' },
      });
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'PICKUP_REQUEST_DELETED',
        entity: 'PickupRequest',
        entityId: id,
        before: {
          status: pickupRequest.status,
          quoteId: pickupRequest.quoteId,
          customerId: pickupRequest.customerId,
          assignedPartnerId: pickupRequest.assignedPartnerId,
          pickupContactName: pickupRequest.pickupContactName,
          pickupDate:
            pickupRequest.pickupDate?.toISOString().slice(0, 10) ?? null,
          pickupTimeSlot: pickupRequest.pickupTimeSlot,
          pickupCity: pickupRequest.pickupCity,
        },
      },
    });

    // Only a live pickup is news to anyone; a cancelled one was announced when it was cancelled.
    if (NON_TERMINAL_STATUSES.includes(pickupRequest.status)) {
      await this.announceCancellation(
        pickupRequest,
        'Booking removed by our team',
      );
    }
  }

  private assertCancellable(pickupRequest: PickupRequestWithDetails): void {
    if (!NON_TERMINAL_STATUSES.includes(pickupRequest.status)) {
      throw new BadRequestException(
        `This pickup is already ${pickupRequest.status} and cannot be cancelled`,
      );
    }
    if (
      pickupRequest.orderId ||
      pickupRequest.paymentCollectedAt ||
      pickupRequest.paymentDeferredAt
    ) {
      throw new BadRequestException(
        'Payment has already been taken for this pickup. Cancel the order instead.',
      );
    }
  }

  private async announceCancellation(
    pickupRequest: PickupRequestWithDetails,
    reason: string,
  ): Promise<void> {
    await this.notificationsService.enqueue(
      pickupRequest.customerId,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.PICKUP_CANCELLED,
      { reason },
    );
    if (pickupRequest.assignedPartnerId) {
      void this.pushService.sendToAdminUser(pickupRequest.assignedPartnerId, {
        title: 'Pickup cancelled',
        body: `${pickupRequest.pickupContactName} · ${reason}`,
        url: '/partner/pickups',
        tag: `pickup-${pickupRequest.id}`,
      });
    }
  }

  private async pushToAdmins(payload: {
    title: string;
    body: string;
    url: string;
    tag: string;
  }): Promise<void> {
    const admins = await this.prisma.adminUser.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true },
      select: { id: true },
    });
    for (const admin of admins) {
      void this.pushService.sendToAdminUser(admin.id, payload);
    }
  }

  /**
   * Correct where a pickup is collected from: the customer gave the wrong building, moved to their
   * shop, or the pin was off. The assigned partner may do it (they are the one at the door); staff
   * may do it on any pickup. Not on a warehouse drop-off (no address) and not once the order exists.
   */
  async updateAddress(
    id: string,
    dto: UpdatePickupAddressDto,
    actorId: string,
    asAdmin = false,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = asAdmin
      ? await this.findOne(id)
      : await this.findOneForPartner(id, actorId);
    if (pickupRequest.dropAtWarehouse) {
      throw new BadRequestException(
        'A warehouse drop-off has no pickup address to change',
      );
    }
    if (
      !NON_TERMINAL_STATUSES.includes(pickupRequest.status) ||
      pickupRequest.orderId
    ) {
      throw new BadRequestException(
        `The address cannot be changed on a pickup that is ${pickupRequest.status}`,
      );
    }

    const pinned = dto.pickupLatitude != null && dto.pickupLongitude != null;
    const next = {
      pickupAddressLine1: dto.pickupAddressLine1.trim(),
      pickupAddressLine2: dto.pickupAddressLine2?.trim() || null,
      pickupCity: dto.pickupCity.trim(),
      pickupState: dto.pickupState.trim(),
      pickupPostalCode: dto.pickupPostalCode.trim(),
      pickupLatitude: pinned ? dto.pickupLatitude! : null,
      pickupLongitude: pinned ? dto.pickupLongitude! : null,
      ...(dto.pickupInstructions !== undefined
        ? { pickupInstructions: dto.pickupInstructions.trim() || null }
        : {}),
    };
    const before = {
      pickupAddressLine1: pickupRequest.pickupAddressLine1,
      pickupAddressLine2: pickupRequest.pickupAddressLine2,
      pickupCity: pickupRequest.pickupCity,
      pickupState: pickupRequest.pickupState,
      pickupPostalCode: pickupRequest.pickupPostalCode,
      pickupLatitude: pickupRequest.pickupLatitude,
      pickupLongitude: pickupRequest.pickupLongitude,
      pickupInstructions: pickupRequest.pickupInstructions,
    };

    await this.prisma.pickupRequest.update({ where: { id }, data: next });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'PICKUP_REQUEST_ADDRESS_UPDATED',
        entity: 'PickupRequest',
        entityId: id,
        before,
        after: { ...next, by: asAdmin ? 'ADMIN' : 'PARTNER' },
      },
    });

    // Whoever did not make the change is told: the partner must not drive to the old address,
    // and the office must not read the old one out to a customer who calls.
    const where = `${next.pickupAddressLine1}, ${next.pickupCity}`;
    if (asAdmin) {
      if (pickupRequest.assignedPartnerId) {
        void this.pushService.sendToAdminUser(pickupRequest.assignedPartnerId, {
          title: 'Pickup address changed',
          body: `${pickupRequest.pickupContactName} · ${where}`,
          url: `/partner/pickups/${id}`,
          tag: `pickup-${id}`,
        });
      }
    } else {
      await this.pushToAdmins({
        title: 'Partner changed a pickup address',
        body: `${pickupRequest.pickupContactName} · ${where}`,
        url: `/admin/pickup-requests/${id}`,
        tag: `pickup-${id}`,
      });
    }
    return this.findOne(id);
  }

  findAllForPartner(
    partnerId: string,
    query: QueryPickupRequestsDto,
  ): Promise<PickupRequestWithDetails[]> {
    // Only what staff assigned to them: partners do not see, or take, unassigned requests.
    const where: Prisma.PickupRequestWhereInput = {
      assignedPartnerId: partnerId,
    };
    if (query.status) where.status = query.status;
    return this.prisma.pickupRequest.findMany({
      where,
      orderBy: { pickupDate: 'asc' },
      ...withDetails,
    });
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
      changes: recalculated
        ? explainPriceChange(
            pickupRequest,
            recalculated,
            dto.weightKg,
            dto.shipmentType,
          )
        : [],
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

    // The customer agrees to the carriage terms by handing the parcel over, so the link goes out
    // the moment the partner is actually at the door — not earlier, when there is nothing yet to
    // agree to.
    await this.notificationsService.enqueue(
      pickupRequest.customerId,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.PICKUP_PARTNER_ARRIVED,
      { termsUrl: `${publicFrontendUrl(this.config)}/terms` },
    );

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
    const destinationCountry = dto.destinationCountry?.trim();
    if (!pickupRequest.quote.destCountry && !destinationCountry) {
      throw new BadRequestException('Choose the destination country');
    }
    if (!pickupRequest.arrivedAt) {
      throw new BadRequestException('Mark arrival before verifying the parcel');
    }
    // Going back to change the boxes or contents after seeing the price is fine until money
    // changes hands; after that the charged amount is fixed.
    if (pickupRequest.paymentCollectedAt || pickupRequest.paymentDeferredAt) {
      throw new BadRequestException(
        'Payment has already been settled, so the parcel details can no longer change',
      );
    }
    // Customs will not clear an export without the shipper's ID, and a photo of the box is the
    // only record of what was actually handed over — both needed before any money changes hands.
    if (
      !pickupRequest.customer.kycDocumentType ||
      !pickupRequest.customer.kycDocumentNumber
    ) {
      throw new BadRequestException(
        "Enter the customer's ID document type and number before verifying the parcel",
      );
    }
    if (pickupRequest.customer.photos.length === 0) {
      throw new BadRequestException(
        "Add a photo of the customer's ID document before verifying the parcel",
      );
    }
    if (!pickupRequest.photos.some((p) => p.kind === 'PARCEL')) {
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
      const recalculated = await this.repriceAgainstOriginalProvider(
        pickupRequest,
        verifiedWeightKg,
        dto.verifiedShipmentType,
      );
      if (recalculated === null) {
        // The weighed parcel falls outside every active slab for this carrier — a 9 kg box where
        // the card stops at 8, say. This used to be fatal, which stranded the partner at the
        // customer's door holding a parcel they could neither price nor hand back. Their own
        // figure is accepted HERE AND ONLY HERE, because there is no tariff to contradict it.
        if (dto.verifiedPrice === undefined) {
          throw new BadRequestException(
            `No rate covers ${verifiedWeightKg}kg as ${dto.verifiedShipmentType} for this carrier — ` +
              'enter the price to charge, or reject the parcel',
          );
        }
        verifiedPrice = dto.verifiedPrice;
      } else {
        // Rejected, not ignored: silently dropping a price the partner typed would show them a
        // number on the phone and record a different one, which is the worst of both. Only
        // reachable when a real rate exists, so there is always a tariff to prefer.
        if (dto.verifiedPrice !== undefined) {
          throw new BadRequestException(
            'This pickup is priced from its rate card — verifiedPrice cannot be set',
          );
        }
        verifiedPrice = recalculated.finalPrice;
        breakdown = recalculated;
      }
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
        ...(destinationCountry ? { destCountry: destinationCountry } : {}),
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
        // A discount was approved against the old price; re-verifying re-prices, so it goes and
        // has to be given (and approved) again.
        doorDiscountAmount: null,
        doorDiscountReason: null,
        doorDiscountApprovedByAdminId: null,
        doorDiscountAt: null,
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
    if (pickupRequest.paymentCollectedAt || pickupRequest.paymentDeferredAt) {
      throw new BadRequestException(
        'Payment has already been settled for this pickup request',
      );
    }

    if (dto.deferred) {
      return this.deferPayment(pickupRequest, dto, partnerId);
    }
    // Everything below is a real collection, so the amounts are present — the DTO makes them
    // required whenever deferred is not set. An older app build sends one method and amount.
    const splits: PaymentSplitDto[] = dto.payments ?? [
      {
        method: dto.paymentMethod as PaymentMethodCode,
        amount: dto.collectedAmount as number,
        reference: dto.paymentReference,
      },
    ];
    if (new Set(splits.map((p) => p.method)).size !== splits.length) {
      throw new BadRequestException(
        'Each payment method can appear only once — add the amounts together',
      );
    }
    const collectedAmount = round2(
      splits.reduce((sum, p) => sum + p.amount, 0),
    );
    // The largest part names the payment wherever only one method fits (the order, analytics).
    const paymentMethod = [...splits].sort((a, b) => b.amount - a.amount)[0]
      .method;
    const paymentReference =
      splits
        .map((p) => p.reference?.trim())
        .filter(Boolean)
        .join(' / ') ||
      dto.paymentReference ||
      null;

    // What is owed at the door, after any coupon the customer applied when booking — charging
    // the undiscounted figure would quietly ignore a discount they were promised.
    const expectedPrice = this.payableFor(pickupRequest);

    // Part-payment: the customer pays what they have and the rest becomes a due. The tolerance
    // check below deliberately does NOT apply — the whole point is that less than the price is
    // collected — so the admin approval takes its place as the control on money left unpaid.
    let dueApproverId: string | null = null;
    if (dto.deferRemainder) {
      if (collectedAmount >= expectedPrice) {
        throw new BadRequestException(
          `Nothing would be left owing — collect ${expectedPrice} in full instead of deferring a remainder`,
        );
      }
      dueApproverId = (await this.requireDueApprover(dto.dueApprovedByAdminId))
        .id;
    } else {
      const tolerance = Math.max(
        expectedPrice * COLLECTED_AMOUNT_TOLERANCE_RATIO,
        COLLECTED_AMOUNT_TOLERANCE_FLOOR,
      );
      if (Math.abs(collectedAmount - expectedPrice) > tolerance) {
        throw new BadRequestException(
          `Collected amount (${collectedAmount}) is too far from the verified price ` +
            `(${expectedPrice}) — if this is legitimate, contact an admin to review and record it.`,
        );
      }
    }

    // Atomic claim (paymentCollectedAt: null guard re-checked against the database, not the
    // in-memory read above) — without this, a double-tap or network retry could both pass the
    // check above and both record a collection, double-charging the audit trail and sending the
    // customer two "payment collected" notifications for one real payment.
    const claim = await this.prisma.pickupRequest.updateMany({
      where: { id, paymentCollectedAt: null, paymentDeferredAt: null },
      data: {
        paymentMethod,
        collectedAmount,
        paymentSplits:
          splits.length > 1
            ? splits.map((p) => ({
                method: p.method,
                amount: round2(p.amount),
                reference: p.reference?.trim() || null,
              }))
            : Prisma.DbNull,
        paymentReference,
        paymentNotes: dto.paymentNotes ?? null,
        paymentCollectedAt: new Date(),
        // Set only on a part-payment: money WAS taken, so this is not paymentDeferredAt — the
        // approver is what marks the unpaid remainder as sanctioned.
        ...(dueApproverId
          ? {
              paymentDueApprovedByAdminId: dueApproverId,
              paymentDueNote: dto.dueNote ?? null,
            }
          : {}),
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
          paymentMethod,
          collectedAmount,
          ...(splits.length > 1
            ? {
                splits: splits.map((p) => ({
                  method: p.method,
                  amount: p.amount,
                })),
              }
            : {}),
        },
      },
    });

    // The receipt PDF goes to the customer's WhatsApp now, at the door, not when the parcel is
    // completed. A receipt that could not be issued (PDF or storage trouble) still leaves the
    // customer a plain "payment received" message; staff can issue it later from the order.
    const receiptSent = await this.receiptsService.issueForPickupAndSendQuietly(
      id,
      partnerId,
    );
    if (!receiptSent) {
      await this.notificationsService.enqueue(
        pickupRequest.customerId,
        'WHATSAPP',
        NOTIFICATION_TEMPLATES.PAYMENT_COLLECTED,
        { amount: String(collectedAmount) },
      );
    }

    return this.findOne(id);
  }

  /**
   * A discount the partner gives at the door, in rupees off, on top of any coupon. It needs an
   * admin named as approving it and a reason: otherwise a partner could take the full price in
   * cash, record a discount, and keep the difference. Amount 0 takes the discount back.
   *
   * Only between verification (when the price is final) and payment (after which it is too late
   * to change what was charged).
   */
  async applyDoorDiscount(
    id: string,
    dto: DoorDiscountDto,
    actorId: string,
    asAdmin = false,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOneForPartner(id, actorId, asAdmin);
    if (!pickupRequest.verifiedAt) {
      throw new BadRequestException(
        'Verify the parcel before giving a discount: the price is not final yet',
      );
    }
    if (pickupRequest.paymentCollectedAt || pickupRequest.paymentDeferredAt) {
      throw new BadRequestException(
        'Payment has already been settled, so the price can no longer change',
      );
    }

    const amount = round2(dto.amount);
    const afterCoupon = this.payableFor({
      ...pickupRequest,
      doorDiscountAmount: 0,
    });
    if (amount >= afterCoupon) {
      throw new BadRequestException(
        `A discount must leave something to pay: at most ${round2(afterCoupon - 1)} here. ` +
          'Use "Pay later" if the customer is not paying now.',
      );
    }

    const approverId =
      amount > 0
        ? (await this.requireDueApprover(dto.approvedByAdminId)).id
        : null;

    await this.prisma.pickupRequest.update({
      where: { id },
      data:
        amount > 0
          ? {
              doorDiscountAmount: amount,
              doorDiscountReason: dto.reason?.trim() ?? null,
              doorDiscountApprovedByAdminId: approverId,
              doorDiscountAt: new Date(),
            }
          : {
              doorDiscountAmount: null,
              doorDiscountReason: null,
              doorDiscountApprovedByAdminId: null,
              doorDiscountAt: null,
            },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action:
          amount > 0
            ? 'PICKUP_DOOR_DISCOUNT_GIVEN'
            : 'PICKUP_DOOR_DISCOUNT_REMOVED',
        entity: 'PickupRequest',
        entityId: id,
        before: { doorDiscountAmount: pickupRequest.doorDiscountAmount },
        after: {
          doorDiscountAmount: amount || null,
          approvedByAdminId: approverId,
          reason: dto.reason?.trim() ?? null,
        },
      },
    });

    return this.findOne(id);
  }

  /**
   * The parcel goes without the money: an admin has approved letting this customer pay later.
   *
   * Recorded as its own event rather than as a zero-rupee collection, because "nobody paid, and
   * X approved that" is a different fact from "the customer paid nothing". The amount owed rides
   * onto the Order in acceptParcel, which is where the customer can see it.
   */
  /**
   * Letting a parcel go without all of the money is an admin's call, not the partner's — whether
   * that is the whole amount (deferPayment) or the remainder of a part-payment.
   */
  private async requireDueApprover(
    adminId: string | undefined,
  ): Promise<{ id: string }> {
    const approver = await this.prisma.adminUser.findFirst({
      where: {
        id: adminId,
        isActive: true,
        role: { in: ['ADMIN', 'SUPER_ADMIN'] },
      },
      select: { id: true },
    });
    if (!approver) {
      throw new BadRequestException(
        'This needs an active admin to approve it — pick one and try again',
      );
    }
    return approver;
  }

  private async deferPayment(
    pickupRequest: PickupRequestWithDetails,
    dto: CollectPaymentDto,
    partnerId: string,
  ): Promise<PickupRequestWithDetails> {
    const approver = await this.requireDueApprover(dto.dueApprovedByAdminId);

    const claim = await this.prisma.pickupRequest.updateMany({
      where: {
        id: pickupRequest.id,
        paymentCollectedAt: null,
        paymentDeferredAt: null,
      },
      data: {
        paymentDeferredAt: new Date(),
        paymentDueApprovedByAdminId: approver.id,
        paymentDueNote: dto.dueNote ?? null,
      },
    });
    if (claim.count === 0) {
      throw new BadRequestException(
        'Payment has already been settled for this pickup request',
      );
    }

    const dueAmount = this.payableFor(pickupRequest);

    await this.prisma.auditLog.create({
      data: {
        actorId: partnerId,
        action: 'PICKUP_REQUEST_PAYMENT_DEFERRED',
        entity: 'PickupRequest',
        entityId: pickupRequest.id,
        before: {},
        after: {
          dueAmount,
          approvedByAdminId: approver.id,
          note: dto.dueNote ?? null,
        },
      },
    });

    return this.findOne(pickupRequest.id);
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
    if (!pickupRequest.paymentCollectedAt && !pickupRequest.paymentDeferredAt) {
      throw new BadRequestException(
        'Collect payment (or record an approved due) before accepting the parcel',
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

    // What the customer owes in total, net of any coupon — the figure every branch below bills,
    // pays off or carries as a due.
    const finalPrice = this.payableFor(pickupRequest);

    // Claimed once, here, where the parcel is actually accepted: validating at booking without
    // redeeming means an abandoned booking never burns a limited code, and a double-tap on
    // accept cannot burn two (the atomic claim above has already returned by now).
    if (pickupRequest.couponId && pickupRequest.discountAmount) {
      try {
        await this.coupons.redeem(pickupRequest.coupon!.code);
      } catch (error) {
        // The parcel is already in the partner's hands and the money is taken — a code that
        // expired in between must not strand the order. The discount the customer was promised
        // still stands; only the redemption count misses out.
        this.logger.warn(
          `Coupon ${pickupRequest.coupon?.code} could not be redeemed for pickup ${id}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: order.id },
        // The coupon travels with the order so the invoice can print the code and the rupees it
        // took off — see Order.couponId/discountAmount.
        // A deferred pickup produces an unpaid order carrying what is owed and who approved the
        // wait — the customer sees it in their portal, and marking it paid later clears it.
        data: {
          couponId: pickupRequest.couponId,
          // The coupon and the door discount together: the invoice takes both off the total.
          // What actually came off, never more than the price: a flat coupon on a parcel that
          // weighed in cheaper than the code is worth takes the bill to zero, not below it.
          discountAmount:
            round2(
              (pickupRequest.verifiedPrice ?? pickupRequest.estimatedPrice) -
                finalPrice,
            ) || null,
          ...(pickupRequest.paymentDeferredAt
            ? {
                paymentStatus: 'PENDING' as const,
                dueAmount: finalPrice,
                dueApprovedByAdminId: pickupRequest.paymentDueApprovedByAdminId,
                paymentMarkedByAdminId: partnerId,
              }
            : pickupRequest.paymentDueApprovedByAdminId
              ? {
                  // Part-paid at the door: money was taken AND a remainder is owed, so the order
                  // carries both. Not PAID — the balance is still outstanding and has to show up
                  // in the customer's dues and on the office's books.
                  paymentStatus: 'PENDING' as const,
                  paymentMethod: pickupRequest.paymentMethod,
                  paidAmount: pickupRequest.collectedAmount,
                  paidAt: pickupRequest.paymentCollectedAt,
                  dueAmount: round2(
                    finalPrice - (pickupRequest.collectedAmount ?? 0),
                  ),
                  dueApprovedByAdminId:
                    pickupRequest.paymentDueApprovedByAdminId,
                  paymentMarkedByAdminId: partnerId,
                }
              : {
                  paymentStatus: 'PAID' as const,
                  paymentMethod: pickupRequest.paymentMethod,
                  paidAmount: pickupRequest.collectedAmount ?? finalPrice,
                  paidAt: pickupRequest.paymentCollectedAt,
                  paymentMarkedByAdminId: partnerId,
                }),
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
      // Issued, not sent: staff review it once the carrier AWB is mapped and send it from
      // there, so the copy the customer gets carries the AWB and any corrections.
      await this.invoicesService.generateForOrder(order.id, partnerId);
    } catch (error) {
      this.logger.warn(
        `Order ${order.id} was created paid from pickup ${id} but could not be invoiced: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    // The receipt went out when the money was taken (collectPayment); it now belongs to the
    // order too. A pickup paid before receipts were issued at the door gets one here instead.
    const linked = await this.prisma.receipt.updateMany({
      where: { pickupRequestId: id, orderId: null },
      data: { orderId: order.id },
    });
    if (linked.count === 0) {
      await this.receiptsService.issueAndSendQuietly(order.id, partnerId);
    }

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
   * Photos taken at the door (or attached by staff afterwards), compressed before they are
   * stored. KYC photos are the customer's, so their next pickup shows them already on file;
   * parcel photos belong to this pickup.
   */
  async savePhotos(
    id: string,
    kind: PickupPhotoKind,
    files: Express.Multer.File[],
    labels: string[] | undefined,
    actorId: string,
    asAdmin = false,
    backOffice = false,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.resolveForUpload(
      id,
      actorId,
      asAdmin,
      backOffice,
    );
    const onFile =
      kind === 'KYC'
        ? pickupRequest.customer.photos.length
        : pickupRequest.photos.filter((p) => p.kind === kind).length;
    if (onFile + files.length > MAX_PHOTOS_PER_KIND) {
      throw new BadRequestException(
        `At most ${MAX_PHOTOS_PER_KIND} photos of each kind: remove some first`,
      );
    }

    const fallback = { KYC: 'Document', PARCEL: 'Parcel', PAYMENT: 'Payment' }[
      kind
    ];
    const given = (labels ?? []).map((l) => l.trim()).filter(Boolean);
    const labelFor = (index: number) => {
      // One label for several photos: "Box", "Box 2", "Box 3".
      if (given.length <= 1) {
        const base = given[0] ?? fallback;
        return files.length > 1 && index > 0 ? `${base} ${index + 1}` : base;
      }
      return given[index] ?? `${fallback} ${index + 1}`;
    };

    const folder =
      kind === 'KYC' ? `kyc/${pickupRequest.customerId}` : `pickups/${id}`;
    const rows: Prisma.PickupPhotoCreateManyInput[] = [];
    for (const [index, file] of files.entries()) {
      const photo = await compressPhoto(file);
      const key = `${folder}/${kind.toLowerCase()}-${randomUUID()}.${photo.extension}`;
      await this.storage.put(key, photo.buffer, photo.mimetype);
      rows.push({
        kind,
        customerId: pickupRequest.customerId,
        pickupRequestId: id,
        key,
        label: labelFor(index),
        sizeBytes: photo.buffer.length,
        uploadedById: actorId,
      });
    }
    await this.prisma.pickupPhoto.createMany({ data: rows });

    if (kind === 'KYC') {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action: 'CUSTOMER_KYC_PHOTOS_ADDED',
          entity: 'Customer',
          entityId: pickupRequest.customerId,
          // Which pickup they were taken on, never the document or its key. `source` separates a
          // photo taken at the door from one an admin attached afterwards, which is exactly the
          // question asked of a KYC record later.
          after: {
            pickupRequestId: id,
            count: rows.length,
            source: backOffice ? 'admin-back-office' : 'pickup',
          },
        },
      });
    }
    return this.findOne(id);
  }

  /** Removes one photo: a blurred shot, or an old ID the customer has since replaced. */
  async deletePhoto(
    id: string,
    photoId: string,
    actorId: string,
    asAdmin = false,
    backOffice = false,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.resolveForUpload(
      id,
      actorId,
      asAdmin,
      backOffice,
    );
    const photo = await this.prisma.pickupPhoto.findUnique({
      where: { id: photoId },
    });
    // A KYC photo is reachable from any of the customer's pickups; a parcel photo only from its own.
    const belongs =
      photo &&
      (photo.kind === 'KYC'
        ? photo.customerId === pickupRequest.customerId
        : photo.pickupRequestId === id);
    if (!photo || !belongs) {
      throw new NotFoundException(`Photo ${photoId} not found`);
    }
    await this.prisma.pickupPhoto.delete({ where: { id: photoId } });
    await this.storage.delete(photo.key);
    if (photo.kind === 'KYC') {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action: 'CUSTOMER_KYC_PHOTO_REMOVED',
          entity: 'Customer',
          entityId: pickupRequest.customerId,
          after: { pickupRequestId: id, label: photo.label },
        },
      });
    }
    return this.findOne(id);
  }

  /** Which identity document the customer showed, and its number. Kept for their next pickup. */
  async setKycDocument(
    id: string,
    dto: KycDocumentDto,
    actorId: string,
    asAdmin = false,
    backOffice = false,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.resolveForUpload(
      id,
      actorId,
      asAdmin,
      backOffice,
    );
    const problem = kycNumberProblem(dto.type, dto.number);
    if (problem) throw new BadRequestException(problem);
    await this.prisma.customer.update({
      where: { id: pickupRequest.customerId },
      data: {
        kycDocumentType: dto.type,
        kycDocumentNumber: normalizeKycNumber(dto.number),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'CUSTOMER_KYC_DOCUMENT_SET',
        entity: 'Customer',
        entityId: pickupRequest.customerId,
        // The type only: the number is personal data and the customer row already holds it.
        before: { type: pickupRequest.customer.kycDocumentType },
        after: {
          type: dto.type,
          pickupRequestId: id,
          source: backOffice ? 'admin-back-office' : 'pickup',
        },
      },
    });
    return this.findOne(id);
  }

  /**
   * Five-minute links to the photos. A partner gets them only on a pickup assigned to them;
   * staff get them on any.
   */
  async documents(
    id: string,
    viewerId: string,
    asAdmin = false,
  ): Promise<PickupDocumentsDto> {
    const pickupRequest = asAdmin
      ? await this.findOne(id)
      : await this.findOneForPartner(id, viewerId);
    const photos = await this.prisma.pickupPhoto.findMany({
      where: {
        OR: [
          { kind: 'KYC', customerId: pickupRequest.customerId },
          { kind: { in: ['PARCEL', 'PAYMENT'] }, pickupRequestId: id },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    const sign = (key: string) =>
      this.storage.isConfigured
        ? this.storage.presignGet(key, 300).catch(() => null)
        : Promise.resolve(null);
    return {
      photos: await Promise.all(
        photos.map(async (photo) => ({
          id: photo.id,
          kind: photo.kind,
          label: photo.label,
          createdAt: photo.createdAt.toISOString(),
          url: await sign(photo.key),
        })),
      ),
    };
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
  /**
   * Which rules an upload has to pass, and why there are two sets.
   *
   * A PARTNER uploading has to be at the door: assigned to this pickup, arrived, and the pickup
   * still open. Those guards are the whole integrity of a photo taken "at pickup" and do not move.
   *
   * An ADMIN filling in a gap afterwards is a different act. By the time an order exists its
   * pickup request is COMPLETED, so every one of those guards refused — which left missing KYC
   * permanently missing, with no way to attach the Aadhaar a customer emailed in later. Staff
   * working the back office are trusted with the record; the audit log is what keeps the two
   * kinds of upload tellable apart.
   */
  private resolveForUpload(
    id: string,
    actorId: string,
    asAdmin: boolean,
    backOffice: boolean,
  ): Promise<PickupRequestWithDetails> {
    return backOffice
      ? this.findOne(id)
      : this.findOneWorkable(id, actorId, asAdmin);
  }

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
        select: {
          paymentMethod: true,
          collectedAmount: true,
          paymentSplits: true,
        },
      }),
    ]);

    // A split payment counts each method's own share, not the whole amount under the largest.
    const collectedBy = (method: PaymentMethodCode) =>
      paymentsToday.reduce((sum, p) => {
        const splits = p.paymentSplits as PaymentSplitDto[] | null;
        if (splits?.length) {
          return (
            sum +
            splits
              .filter((split) => split.method === method)
              .reduce((part, split) => part + split.amount, 0)
          );
        }
        return p.paymentMethod === method
          ? sum + (p.collectedAmount ?? 0)
          : sum;
      }, 0);
    const cashCollectedToday = round2(collectedBy('CASH'));
    const upiCollectedToday = round2(collectedBy('UPI'));

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
