import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { ShipmentsService } from '../shipments/shipments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TEMPLATES } from '../notifications/templates';
import type { UpdateOrderPaymentDto } from '@nationwide/shared-types';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

const RECORD_NOT_FOUND = 'P2025';
const DEFAULT_PROVIDER_CODE = 'ICL';

export type OrderWithShipments = Prisma.OrderGetPayload<{
  include: { shipments: true };
}>;

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

  findAll(): Promise<OrderWithShipments[]> {
    return this.prisma.order.findMany({
      include: { shipments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findAllForCustomer(customerId: string): Promise<OrderWithShipments[]> {
    return this.prisma.order.findMany({
      where: { customerId },
      include: { shipments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<OrderWithShipments> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { shipments: true },
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
    await this.findOne(id); // 404s if missing
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
