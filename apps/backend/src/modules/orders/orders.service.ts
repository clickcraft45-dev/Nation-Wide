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
    // Throws NotFoundException if the customer doesn't exist.
    await this.customersService.findOne(dto.customerId);
    const provider = await this.resolveProvider(dto.providerCode);

    const order = await this.prisma.order.create({
      data: { customerId: dto.customerId },
    });
    const shipment = await this.shipmentsService.createForOrder(
      order.id,
      provider.id,
    );

    await this.notificationsService.enqueue(
      dto.customerId,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.ORDER_CONFIRMATION,
      { trackingNumber: shipment.internalTrackingNumber },
    );

    return this.findOne(order.id);
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
