import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { resolvePagination } from '../../common/utils/pagination.util';
import { CustomersService } from '../customers/customers.service';
import { ShipmentsService } from '../shipments/shipments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TEMPLATES } from '../notifications/templates';
import { InvoicesService } from '../invoices/invoices.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { RoutingService } from '../routing/routing.service';
import { CouponsService } from '../coupons/coupons.service';
import type {
  CancellationQuoteDto,
  UpdateOrderPaymentDto,
} from '@nationwide/shared-types';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import type { QueryOrdersDto, OrderSortKey } from './dto/query-orders.dto';

const RECORD_NOT_FOUND = 'P2025';
const DEFAULT_PROVIDER_CODE = 'ICL';
const IN_TRANSIT_STATUSES = ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'];

// ponytail: callers that omit page/pageSize (dashboard, reports, payments) get every row that
// matches their filter, capped here rather than truly unbounded. Each order's shipments/quote/
// pickupRequest include costs real per-row round trips against MongoDB, and "every order the
// business has ever taken" (tens of thousands) turned that into a request that never returned —
// see the incident this constant was added for. 1000 keeps a filterless request answering in
// seconds instead of hanging; add a real from/to date filter (buildWhere already supports
// customerId/status this way — createdAt would be the same shape) to the callers above that
// legitimately need more than the most recent 1000 rather than raising this number.
const MAX_UNBOUNDED_ORDERS = 1000;

const withShipments = {
  include: {
    // The AWB mappings come along with the shipment: the admin Orders list shows the number and
    // filters on its presence, and fetching them per row afterwards would be a query per order.
    shipments: { include: { externalTrackingNumbers: true } },
    // Just the name. A list view needs it to label the row, and joining it here is one query
    // instead of every caller fetching the whole customer table to build an id->name map.
    customer: { select: { name: true } },
    // The code that discounted this order, and the admin who let it go out unpaid — both are
    // display-only joins the Payments screen and the customer's own orders list read.
    coupon: { select: { code: true } },
    dueApprovedBy: { select: { name: true } },
    // The route columns the admin Orders table shows. An admin manual quote carries the whole
    // origin address; the self-service flow leaves those null and puts the pickup location on
    // the PickupRequest instead, so both are pulled and the mapper picks whichever exists.
    quote: {
      select: {
        id: true,
        originCity: true,
        originCountry: true,
        destCity: true,
        destCountry: true,
      },
    },
    pickupRequest: {
      select: {
        pickupCity: true,
        pickupState: true,
        // The per-km half of a cancellation fee is measured from these.
        pickupLatitude: true,
        pickupLongitude: true,
      },
    },
  },
};
export type OrderWithShipments = Prisma.OrderGetPayload<typeof withShipments>;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService,
    private readonly shipmentsService: ShipmentsService,
    private readonly notificationsService: NotificationsService,
    private readonly invoices: InvoicesService,
    private readonly receipts: ReceiptsService,
    private readonly routing: RoutingService,
    private readonly coupons: CouponsService,
  ) {}

  async create(dto: CreateOrderDto): Promise<OrderWithShipments> {
    const { order, shipment } = await this.createOrderWithShipment(
      dto.customerId,
      dto.providerCode,
    );

    await this.notificationsService.enqueue(
      dto.customerId,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.ORDER_CONFIRMATION,
      { trackingNumber: shipment.internalTrackingNumber },
    );

    return this.findOne(order.id);
  }

  // Shared primitive: order + linked shipment, no notification. Reused by QuotesService when a
  // customer accepts a quote, so quote-acceptance never duplicates this logic.
  async createOrderWithShipment(customerId: string, providerCode?: string) {
    // Throws NotFoundException if the customer doesn't exist.
    await this.customersService.findOne(customerId);
    const provider = await this.resolveProvider(providerCode);

    const order = await this.prisma.order.create({
      data: { customerId },
    });
    const shipment = await this.shipmentsService.createForOrder(
      order.id,
      provider.id,
    );

    return { order, shipment };
  }

  // total is only computed when pagination was actually requested — see CustomersService.findAll
  // for why this is a non-breaking opt-in rather than a response-shape change.
  async findAll(
    query: QueryOrdersDto = {},
  ): Promise<{ data: OrderWithShipments[]; total: number | null }> {
    const where = this.buildWhere(query);
    const orderBy = this.resolveOrderBy(query.sortKey, query.sortDir);
    const paging = resolvePagination(query);
    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        ...withShipments,
        orderBy,
        ...(paging ?? { skip: 0, take: MAX_UNBOUNDED_ORDERS }),
      }),
      paging ? this.prisma.order.count({ where }) : Promise.resolve(null),
    ]);
    return { data, total };
  }

  private buildWhere(query: QueryOrdersDto): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.customerId) where.customerId = query.customerId;

    // Whole-UTC-day bounds, matching how the clients compare dates (createdAt.slice(0, 10)).
    // `createdTo` has to run to the end of its day or the final day of a window is dropped.
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {
        ...(query.createdFrom
          ? { gte: new Date(`${query.createdFrom}T00:00:00.000Z`) }
          : {}),
        ...(query.createdTo
          ? { lte: new Date(`${query.createdTo}T23:59:59.999Z`) }
          : {}),
      };
    }

    const shipmentConditions: Prisma.ShipmentWhereInput = {};
    if (query.providerId) shipmentConditions.providerId = query.providerId;
    if (query.trackingGroup === 'in-transit') {
      shipmentConditions.currentStatus = { in: IN_TRANSIT_STATUSES };
    } else if (query.trackingGroup === 'delivered') {
      shipmentConditions.currentStatus = 'DELIVERED';
    }
    if (Object.keys(shipmentConditions).length > 0) {
      where.shipments = { some: shipmentConditions };
    }

    // Mapped means at least one shipment already carries an AWB; unmapped means not one does.
    // `none` rather than `some: { is: null }` so an order with no shipments at all still counts
    // as unmapped, which is what an admin chasing missing numbers expects to see.
    if (query.awb === 'mapped') {
      where.shipments = {
        ...(where.shipments ?? {}),
        some: {
          ...(shipmentConditions ?? {}),
          externalTrackingNumbers: { some: {} },
        },
      };
    } else if (query.awb === 'unmapped') {
      where.shipments = {
        ...(where.shipments ?? {}),
        none: { externalTrackingNumbers: { some: {} } },
      };
      // A cancelled order is never going to be given an AWB, so it does not belong in the queue
      // of orders waiting for one — it sat there forever, unactionable, burying the rows that
      // did need work. Only when the caller has not asked for a status itself: someone who
      // explicitly filters to CANCELLED is entitled to see exactly that.
      if (!query.status) {
        where.status = { not: 'CANCELLED' };
      }
    }

    // Both are about a cancelled order, but neither is restricted to one: an order refunded
    // before cancellation, or a parcel returned on a delivery exception, is still a real query.
    if (query.refund === 'refunded') {
      where.refundedAt = { not: null };
    } else if (query.refund === 'not-refunded') {
      where.refundedAt = null;
    }

    if (query.returned === 'returned') {
      where.returnedAt = { not: null };
    } else if (query.returned === 'not-returned') {
      where.returnedAt = null;
    }

    if (query.search) {
      where.OR = [
        { id: { contains: query.search, mode: 'insensitive' } },
        {
          shipments: {
            some: {
              internalTrackingNumber: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
          },
        },
        { customer: { name: { contains: query.search, mode: 'insensitive' } } },
        {
          customer: { phone: { contains: query.search, mode: 'insensitive' } },
        },
      ];
    }

    return where;
  }

  private resolveOrderBy(
    sortKey?: OrderSortKey,
    sortDir: 'asc' | 'desc' = 'desc',
  ): Prisma.OrderOrderByWithRelationInput {
    switch (sortKey) {
      case 'id':
        return { id: sortDir };
      case 'customer':
        return { customer: { name: sortDir } };
      case 'status':
        return { status: sortDir };
      default:
        return { createdAt: sortDir };
    }
  }

  findAllForCustomer(customerId: string): Promise<OrderWithShipments[]> {
    return this.prisma.order.findMany({
      where: { customerId },
      ...withShipments,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** The same lookup as findOne, but an order belonging to someone else simply does not exist. */
  async findOneForCustomer(
    id: string,
    customerId: string,
  ): Promise<OrderWithShipments> {
    const order = await this.findOne(id);
    if (order.customerId !== customerId) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
  }

  async findOne(id: string): Promise<OrderWithShipments> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      ...withShipments,
    });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
  }

  async update(id: string, dto: UpdateOrderDto): Promise<OrderWithShipments> {
    try {
      await this.prisma.order.update({
        where: { id },
        data: { status: dto.status },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === RECORD_NOT_FOUND
      ) {
        throw new NotFoundException(`Order ${id} not found`);
      }
      throw error;
    }
    return this.findOne(id);
  }

  // Kept separate from update() (order lifecycle status) so payment and status can't
  // accidentally cross-write on the same PATCH body.
  /**
   * Record that the parcel behind a cancelled order has (or has not) come back.
   *
   * A plain state flip rather than an event log: staff want to know whether the goods are still
   * theirs to hold, and a mis-click has to be undoable. The audit entry is what preserves who
   * said what and when.
   */
  async setReturned(
    id: string,
    returned: boolean,
    note: string | undefined,
    actorId: string,
  ): Promise<OrderWithShipments> {
    const before = await this.findOne(id); // 404s if missing

    await this.prisma.order.update({
      where: { id },
      data: {
        returnedAt: returned ? new Date() : null,
        // The note belongs to the return it describes, so undoing one clears it too.
        returnNote: returned ? (note ?? null) : null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: returned ? 'ORDER_PARCEL_RETURNED' : 'ORDER_RETURN_UNDONE',
        entity: 'Order',
        entityId: id,
        before: { returnedAt: before.returnedAt?.toISOString() ?? null },
        after: { returned, note: returned ? (note ?? null) : null },
      },
    });

    return this.findOne(id);
  }

  async updatePayment(
    id: string,
    dto: UpdateOrderPaymentDto,
    actorId: string,
  ): Promise<OrderWithShipments> {
    const before = await this.findOne(id); // 404s if missing

    // The discount is claimed before the payment is written, and only on the way to PAID: a code
    // is validated and its redemption counted here, against the database, never taken on trust
    // from whatever the admin screen previewed. paidAmount stays exactly what the admin typed —
    // it is the money that actually changed hands — and the discount is recorded beside it.
    const coupon =
      dto.paymentStatus === 'PAID' && dto.couponCode
        ? await this.coupons.redeem(dto.couponCode)
        : null;

    await this.prisma.order.update({
      where: { id },
      data: {
        paymentStatus: dto.paymentStatus,
        paymentMethod: dto.paymentMethod,
        paidAmount: dto.paymentStatus === 'PAID' ? dto.paidAmount : null,
        paidAt: dto.paymentStatus === 'PAID' ? new Date() : null,
        paymentMarkedByAdminId: actorId,
        // Who paid and why it is worth noting stay with the payment they describe, so flipping
        // an order back to PENDING does not leave last month's payer name on it.
        paymentPayerName:
          dto.paymentStatus === 'PAID' ? (dto.paymentPayerName ?? null) : null,
        paymentNote:
          dto.paymentStatus === 'PAID' ? (dto.paymentNote ?? null) : null,
        // A refund is its own event: the amount is what went back, which is rarely the whole
        // of what was paid.
        refundedAmount:
          dto.paymentStatus === 'REFUNDED'
            ? (dto.refundedAmount ?? null)
            : null,
        refundedAt: dto.paymentStatus === 'REFUNDED' ? new Date() : null,
        refundNote:
          dto.paymentStatus === 'REFUNDED' ? (dto.refundNote ?? null) : null,
        // A coupon belongs to the payment it discounted, so moving off PAID clears it. The
        // redemption already counted stays counted — it was used.
        couponId: coupon ? coupon.id : dto.paymentStatus === 'PAID' ? undefined : null,
        discountAmount: coupon
          ? coupon.discountAmount
          : dto.paymentStatus === 'PAID'
            ? undefined
            : null,
        // Recording a payment settles whatever was outstanding.
        dueAmount: dto.paymentStatus === 'PAID' ? null : undefined,
      },
    });

    // A financial state change — every other money-touching mutation in this codebase
    // (rate changes, pickup-request payment collection) writes an AuditLog entry; this one was
    // the one gap, leaving no queryable record of who changed a payment status/amount and when.
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'ORDER_PAYMENT_UPDATED',
        entity: 'Order',
        entityId: id,
        before: {
          paymentStatus: before.paymentStatus,
          paymentMethod: before.paymentMethod,
          paidAmount: before.paidAmount ? before.paidAmount : null,
          paymentPayerName: before.paymentPayerName,
          refundedAmount: before.refundedAmount ?? null,
        },
        after: {
          paymentStatus: dto.paymentStatus,
          paymentMethod: dto.paymentMethod ?? null,
          paidAmount:
            dto.paymentStatus === 'PAID' ? (dto.paidAmount ?? null) : null,
          paymentPayerName:
            dto.paymentStatus === 'PAID'
              ? (dto.paymentPayerName ?? null)
              : null,
          refundedAmount:
            dto.paymentStatus === 'REFUNDED'
              ? (dto.refundedAmount ?? null)
              : null,
          couponCode: coupon?.code ?? null,
          discountAmount: coupon?.discountAmount ?? null,
        },
      },
    });

    // The bill, raised automatically the moment the money is recorded — a customer who has paid
    // should not have to ask anyone for their invoice.
    //
    // Deliberately AFTER the payment write and deliberately swallowing its own failure: the
    // payment is the fact being recorded here, and it must not be rolled back or reported as
    // failed because a PDF could not be rendered or the company's GSTIN is not filled in yet.
    // generateForOrder is idempotent, so the admin's "Generate invoices" screen remains the
    // retry path for anything that lands here unbilled.
    if (dto.paymentStatus === 'PAID') {
      try {
        await this.invoices.generateForOrder(id, actorId);
      } catch (error) {
        this.logger.warn(
          `Order ${id} was marked paid but its invoice could not be issued: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      // And the receipt, which is the customer's proof the money was received. Issued AFTER the
      // invoice so it can reference the invoice number, but not conditional on it: invoicing is
      // blocked whenever the company's statutory settings are incomplete, and that is precisely
      // when a customer who has paid most needs something in writing. Swallows its own failures
      // for the same reason the invoice call above does.
      await this.receipts.issueAndSendQuietly(id, actorId);
    }

    return this.findOne(id);
  }

  /**
   * What cancelling this order would cost right now, and whether it may be cancelled at all.
   *
   * The cutoff is the AWB: until one is mapped nothing has been handed to a carrier, so the
   * customer may still call it off themselves. Afterwards the parcel is in someone else's
   * network and cancelling is a support conversation, not a button.
   */
  async quoteCancellation(id: string): Promise<CancellationQuoteDto> {
    const order = await this.findOne(id); // 404s if missing
    const settings = await this.prisma.companySettings.findFirst({
      where: { isActive: true },
    });
    const baseFee = settings?.cancellationBaseFee ?? 0;
    const perKmFee = settings?.cancellationPerKmFee ?? 0;

    // The van drives roads, not great circles, so the per-km charge is the driving distance —
    // a shortest-path search over the road network, run by the routing engine that holds it.
    const distance = await this.routing.distanceKm(
      settings?.warehouseLatitude ?? null,
      settings?.warehouseLongitude ?? null,
      order.pickupRequest?.pickupLatitude ?? null,
      order.pickupRequest?.pickupLongitude ?? null,
    );

    const reason = this.cancellationBlockedReason(order);
    return {
      isCancellable: reason === null,
      reason,
      baseFee,
      perKmFee,
      distanceKm: distance?.km ?? null,
      distanceSource: distance?.source ?? null,
      // No coordinates means no measurable trip, so only the base fee stands rather than a
      // guessed distance the customer would be charged for.
      totalFee: round2(baseFee + perKmFee * (distance?.km ?? 0)),
    };
  }

  private cancellationBlockedReason(order: OrderWithShipments): string | null {
    if (order.status === 'CANCELLED') return 'This order is already cancelled.';
    if (order.status === 'COMPLETED') return 'This order is already completed.';
    if (order.shipments.some((s) => s.externalTrackingNumbers.length > 0)) {
      return 'An AWB has been issued for this order — contact support to cancel it.';
    }
    return null;
  }

  /**
   * Cancel an order and freeze the fee that was quoted for doing so.
   *
   * `customerId`, when given, scopes this to that customer's own order — the customer-facing
   * route passes it so one account can never cancel another's.
   */
  async cancel(
    id: string,
    reason: string | undefined,
    actorId: string,
    customerId?: string,
  ): Promise<OrderWithShipments> {
    const order = await this.findOne(id);
    if (customerId && order.customerId !== customerId) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    const blocked = this.cancellationBlockedReason(order);
    if (blocked) throw new BadRequestException(blocked);

    const quote = await this.quoteCancellation(id);
    await this.prisma.order.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: reason ?? null,
        cancellationFee: quote.totalFee,
        cancellationDistanceKm: quote.distanceKm,
        cancellationDistanceSource: quote.distanceSource,
      },
    });

    // The pickup dies with the order. Without this a partner is still dispatched to a door for
    // a shipment nobody is sending — the request stays assigned and keeps showing on their list.
    // A pickup already completed is left alone: it is a record of something that happened.
    if (order.pickupRequest) {
      // updateMany, not update: the status guard belongs in the where clause, and it makes this
      // a no-op rather than a throw if the pickup was completed a moment ago.
      await this.prisma.pickupRequest.updateMany({
        where: { orderId: id, status: { not: 'COMPLETED' } },
        data: {
          status: 'CANCELLED',
          rejectionReason: reason ?? 'Order cancelled',
        },
      });
    }

    // The fee is a supply the business made (a wasted trip), so it is billed rather than left as
    // a number on a cancelled row. Swallows its own failure for the same reason the paid-order
    // invoice does: the cancellation is the fact being recorded, and it must not be rolled back
    // because the company's GSTIN is not filled in yet. The admin invoices screen is the retry.
    if (quote.totalFee > 0) {
      try {
        await this.invoices.issueCustom(
          {
            customerId: order.customerId,
            grossAmount: quote.totalFee,
            description: `Cancellation charge for order ${id.slice(0, 8)}`,
          },
          actorId,
        );
      } catch (error) {
        this.logger.warn(
          `Order ${id} was cancelled but its cancellation charge could not be invoiced: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'ORDER_CANCELLED',
        entity: 'Order',
        entityId: id,
        before: { status: order.status },
        after: {
          status: 'CANCELLED',
          cancellationFee: quote.totalFee,
          cancellationDistanceKm: quote.distanceKm,
          cancellationDistanceSource: quote.distanceSource,
        },
        reason,
      },
    });

    return this.findOne(id);
  }

  private async resolveProvider(providerCode?: string) {
    const code = providerCode ?? DEFAULT_PROVIDER_CODE;
    const provider = await this.prisma.shippingProvider.findUnique({
      where: { code },
    });
    if (!provider) {
      throw new BadRequestException(`Unknown shipping provider code: ${code}`);
    }
    return provider;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
