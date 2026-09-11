import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  PickupRequestStatusCode,
  RecalculatePreviewDto,
} from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
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

const withDetails = {
  include: {
    customer: { select: { name: true, phone: true } },
    assignedPartner: { select: { id: true, name: true, email: true } },
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

      // Optional here — the partner confirms (or takes down) the recipient at the door either way.
      if (dto.recipient) {
        await tx.quote.update({
          where: { id: quote.id },
          data: recipientToQuoteData(dto.recipient),
        });
      }

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
          dropAtWarehouse: dto.dropAtWarehouse,
          pickupContactName: dto.pickupContactName,
          pickupContactPhone: dto.pickupContactPhone,
          // Blank on a warehouse drop-off: there is no pickup address to record.
          pickupAddressLine1: dto.dropAtWarehouse
            ? ''
            : (dto.pickupAddressLine1 ?? ''),
          pickupAddressLine2: dto.dropAtWarehouse
            ? null
            : (dto.pickupAddressLine2 ?? null),
          pickupCity: dto.dropAtWarehouse ? '' : (dto.pickupCity ?? ''),
          pickupState: dto.dropAtWarehouse ? '' : (dto.pickupState ?? ''),
          pickupPostalCode: dto.dropAtWarehouse
            ? ''
            : (dto.pickupPostalCode ?? ''),
          pickupLatitude: dto.dropAtWarehouse
            ? null
            : (dto.pickupLatitude ?? null),
          pickupLongitude: dto.dropAtWarehouse
            ? null
            : (dto.pickupLongitude ?? null),
          pickupDate: dto.dropAtWarehouse
            ? null
            : dto.pickupDate
              ? new Date(dto.pickupDate)
              : null,
          pickupTimeSlot: dto.dropAtWarehouse
            ? null
            : (dto.pickupTimeSlot ?? null),
          pickupInstructions: dto.pickupInstructions ?? null,
        },
      });
    });

    await this.notificationsService.enqueue(
      customerId,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.PICKUP_REQUEST_RECEIVED,
      {},
    );

    // Single-partner operation (for now): every new pickup request auto-assigns to the one
    // active Pickup Partner instead of sitting in PENDING_ASSIGNMENT for an admin to hand-pick —
    // there's no dispatch decision to make when there's only one partner. Falls back to
    // PENDING_ASSIGNMENT (admin can still assign manually via PATCH .../assign) if no active
    // partner exists yet. actorId is the partner's own id — there's no human admin behind this
    // assignment, and AuditLog.actorId is an AdminUser FK, so the assignee is the only valid,
    // meaningful actor to record.
    const autoAssignPartner = await this.prisma.adminUser.findFirst({
      where: { role: 'PICKUP_PARTNER', isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (autoAssignPartner) {
      await this.assignPartner(
        created.id,
        autoAssignPartner.id,
        autoAssignPartner.id,
      );
    }

    return this.findOne(created.id);
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

    return this.findOne(id);
  }

  findAllForPartner(
    partnerId: string,
    query: QueryPickupRequestsDto,
  ): Promise<PickupRequestWithDetails[]> {
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

  async findOneForPartner(
    id: string,
    partnerId: string,
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOne(id);
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
  ): Promise<RecalculatePreviewDto> {
    const pickupRequest = await this.findOneForPartner(id, partnerId);
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
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOneForPartner(id, partnerId);
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
      return this.findOneForPartner(id, partnerId);
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
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOneForPartner(id, partnerId);
    if (!NON_TERMINAL_STATUSES.includes(pickupRequest.status)) {
      throw new BadRequestException(
        `Cannot verify a pickup request that is already ${pickupRequest.status}`,
      );
    }
    if (!pickupRequest.arrivedAt) {
      throw new BadRequestException('Mark arrival before verifying the parcel');
    }

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
        dto.verifiedWeightKg,
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
    if (dto.recipient) {
      await this.prisma.quote.update({
        where: { id: pickupRequest.quoteId },
        data: recipientToQuoteData(dto.recipient),
      });
    }

    await this.prisma.pickupRequest.update({
      where: { id },
      data: {
        ...(dto.recipient ? { recipientVerifiedAt: new Date() } : {}),
        verifiedWeightKg: dto.verifiedWeightKg,
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
        after: { verifiedWeightKg: dto.verifiedWeightKg, verifiedPrice },
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
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOneForPartner(id, partnerId);
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
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOneForPartner(id, partnerId);
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
  ): Promise<PickupRequestWithDetails> {
    const pickupRequest = await this.findOneForPartner(id, partnerId);
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
