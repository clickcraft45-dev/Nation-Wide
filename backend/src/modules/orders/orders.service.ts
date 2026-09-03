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
import type { UpdateOrderPaymentDto } from '@nationwide/shared-types';
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
    shipments: true,
    // Just the name. A list view needs it to label the row, and joining it here is one query
    // instead of every caller fetching the whole customer table to build an id->name map.
    customer: { select: { name: true } },
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
    pickupRequest: { select: { pickupCity: true, pickupState: true } },
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
  async updatePayment(
    id: string,
    dto: UpdateOrderPaymentDto,
    actorId: string,
  ): Promise<OrderWithShipments> {
    const before = await this.findOne(id); // 404s if missing
    await this.prisma.order.update({
      where: { id },
      data: {
        paymentStatus: dto.paymentStatus,
        paymentMethod: dto.paymentMethod,
        paidAmount: dto.paymentStatus === 'PAID' ? dto.paidAmount : null,
        paidAt: dto.paymentStatus === 'PAID' ? new Date() : null,
        paymentMarkedByAdminId: actorId,
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
        },
        after: {
          paymentStatus: dto.paymentStatus,
          paymentMethod: dto.paymentMethod ?? null,
          paidAmount:
            dto.paymentStatus === 'PAID' ? (dto.paidAmount ?? null) : null,
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
    }

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
