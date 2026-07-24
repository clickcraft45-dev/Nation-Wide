import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PickupStatusCode } from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TEMPLATES } from '../notifications/templates';
import { QueryPickupsDto } from './dto/query-pickups.dto';
import { UpdatePickupStatusDto } from './dto/update-pickup-status.dto';

// Method-specific transition maps — a Pickup's valid next-statuses depend on whether it's a
// real pickup or a warehouse drop-off (Section: Pickup lifecycle). Only the terminal state
// differs; everything before that is either the full pickup chain or the drop-off's much
// shorter one.
const PICKUP_TRANSITIONS: Record<string, string[]> = {
  SCHEDULED: ['PENDING', 'CANCELLED'],
  PENDING: ['ASSIGNED', 'CANCELLED', 'PICKUP_FAILED'],
  ASSIGNED: ['PICKUP_IN_PROGRESS', 'CANCELLED', 'PICKUP_FAILED'],
  PICKUP_IN_PROGRESS: ['PICKED_UP', 'PICKUP_FAILED'],
  PICKED_UP: [],
  CANCELLED: [],
  PICKUP_FAILED: [],
};

const DROP_OFF_TRANSITIONS: Record<string, string[]> = {
  SCHEDULED: ['DROPPED_OFF', 'CANCELLED'],
  DROPPED_OFF: [],
  CANCELLED: [],
};

const TERMINAL_STATUSES = new Set<PickupStatusCode>(['PICKED_UP', 'DROPPED_OFF']);

const withDetails = {
  include: {
    quote: {
      select: {
        customerId: true,
        customer: { select: { name: true, phone: true } },
      },
    },
    assignedStaff: { select: { email: true } },
    confirmedByAdmin: { select: { email: true } },
  },
};
export type PickupWithDetails = Prisma.PickupGetPayload<typeof withDetails>;

@Injectable()
export class PickupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Excludes WAREHOUSE_DROP_OFF by default — drop-offs never appear as scheduled pickups
  // (Section: Warehouse drop-off management).
  findAll(query: QueryPickupsDto): Promise<PickupWithDetails[]> {
    return this.prisma.pickup.findMany({
      where: { method: 'PICKUP', ...this.buildWhere(query) },
      orderBy: { scheduledDate: 'asc' },
      ...withDetails,
    });
  }

  findDropOffs(query: QueryPickupsDto): Promise<PickupWithDetails[]> {
    return this.prisma.pickup.findMany({
      where: { method: 'WAREHOUSE_DROP_OFF', ...this.buildWhere(query) },
      orderBy: { createdAt: 'desc' },
      ...withDetails,
    });
  }

  async findOne(id: string): Promise<PickupWithDetails> {
    const pickup = await this.prisma.pickup.findUnique({
      where: { id },
      ...withDetails,
    });
    if (!pickup) {
      throw new NotFoundException(`Pickup ${id} not found`);
    }
    return pickup;
  }

  async updateStatus(
    id: string,
    dto: UpdatePickupStatusDto,
    actorId: string,
  ): Promise<PickupWithDetails> {
    const pickup = await this.findOne(id);
    const transitions =
      pickup.method === 'WAREHOUSE_DROP_OFF'
        ? DROP_OFF_TRANSITIONS
        : PICKUP_TRANSITIONS;
    const allowed = transitions[pickup.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition pickup from ${pickup.status} to ${dto.status}`,
      );
    }

    const isTerminal = TERMINAL_STATUSES.has(dto.status);

    await this.prisma.pickup.update({
      where: { id },
      data: {
        status: dto.status,
        weightVerifiedKg: dto.weightVerifiedKg ?? pickup.weightVerifiedKg,
        notes: dto.notes ?? pickup.notes,
        ...(isTerminal
          ? { confirmedByAdminId: actorId, confirmedAt: new Date() }
          : {}),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action:
          dto.status === 'PICKED_UP'
            ? 'PICKUP_MARKED_PICKED_UP'
            : dto.status === 'DROPPED_OFF'
              ? 'WAREHOUSE_DROP_OFF_CONFIRMED'
              : 'PICKUP_STATUS_CHANGED',
        entity: 'Pickup',
        entityId: id,
        before: { status: pickup.status },
        after: { status: dto.status },
      },
    });

    if (isTerminal) {
      await this.notificationsService.enqueue(
        pickup.quote.customerId,
        'WHATSAPP',
        NOTIFICATION_TEMPLATES.PICKUP_CONFIRMED,
        { status: dto.status },
      );
    }

    return this.findOne(id);
  }

  private buildWhere(query: QueryPickupsDto): Prisma.PickupWhereInput {
    const where: Prisma.PickupWhereInput = {};
    if (query.status) where.status = query.status;

    if (query.date) {
      where.scheduledDate = new Date(`${query.date}T00:00:00.000Z`);
    } else if (query.range) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      if (query.range === 'today') {
        where.scheduledDate = today;
      } else if (query.range === 'tomorrow') {
        const tomorrow = new Date(today);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        where.scheduledDate = tomorrow;
      } else if (query.range === 'next7') {
        const in7Days = new Date(today);
        in7Days.setUTCDate(in7Days.getUTCDate() + 7);
        where.scheduledDate = { gte: today, lte: in7Days };
      }
    }

    return where;
  }
}
