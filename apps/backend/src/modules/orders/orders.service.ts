import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { resolvePagination } from '../../common/utils/pagination.util';
import { CustomersService } from '../customers/customers.service';
import { ShipmentsService } from '../shipments/shipments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TEMPLATES } from '../notifications/templates';
import type { UpdateOrderPaymentDto } from '@nationwide/shared-types';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import type { QueryOrdersDto, OrderSortKey } from './dto/query-orders.dto';

const RECORD_NOT_FOUND = 'P2025';
const DEFAULT_PROVIDER_CODE = 'ICL';
const IN_TRANSIT_STATUSES = ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'];

const withShipments = {
  include: { shipments: true, quote: { select: { id: true } } },
};
export type OrderWithShipments = Prisma.OrderGetPayload<typeof withShipments>;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService,
    private readonly shipmentsService: ShipmentsService,
    private readonly notificationsService: NotificationsService,
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
        ...paging,
      }),
      paging ? this.prisma.order.count({ where }) : Promise.resolve(null),
    ]);
    return { data, total };
  }

  private buildWhere(query: QueryOrdersDto): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;

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
          paidAmount: before.paidAmount ? before.paidAmount.toNumber() : null,
        },
        after: {
          paymentStatus: dto.paymentStatus,
          paymentMethod: dto.paymentMethod ?? null,
          paidAmount:
            dto.paymentStatus === 'PAID' ? (dto.paidAmount ?? null) : null,
        },
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
