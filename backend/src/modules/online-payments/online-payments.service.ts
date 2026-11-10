import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { OnlinePayment, OnlinePaymentStatus } from '@prisma/client';
import type {
  MyOnlinePaymentsDto,
  OnlineCheckoutDto,
} from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { publicFrontendUrl } from '../../common/config/public-urls';
import { OrdersService } from '../orders/orders.service';
import type { OrderWithShipments } from '../orders/orders.service';
import { YoupiClient, YoupiError } from './youpi.client';
import {
  toOnlinePaymentDto,
  withOrderForAdmin,
  type OnlinePaymentForAdmin,
} from './online-payment.mapper';

const UNIQUE_VIOLATION = 'P2002';

/** The gateway says money moved; nobody at the office has checked the bank yet. */
const AWAITING_REVIEW: OnlinePaymentStatus[] = [
  'OBSERVED',
  'RECONCILED',
  'MANUAL_REVIEW',
];
/** Still capable of taking the customer's money, so a second attempt must not be opened. */
const OPEN: OnlinePaymentStatus[] = ['CREATED', ...AWAITING_REVIEW];
/**
 * A checkout that ended without money. A bank alert can still land on one of these: the gateway
 * matches late observations for half an hour after a session closes.
 */
const ENDED_UNPAID: OnlinePaymentStatus[] = ['FAILED', 'EXPIRED', 'CANCELLED'];

/** The fields of a gateway webhook this service reads. Everything else is stored, not trusted. */
export interface YoupiWebhookPayload {
  event?: unknown;
  orderId?: unknown;
  paymentId?: unknown;
  amountPaise?: unknown;
  currency?: unknown;
  method?: unknown;
  utr?: unknown;
  settlementState?: unknown;
}

export interface WebhookTransition {
  status: OnlinePaymentStatus;
  /** The states this may be applied from; anything else means the event arrived too late. */
  from: OnlinePaymentStatus[];
  note: string | null;
}

/**
 * What a webhook does to an attempt, as a pure decision.
 *
 * The gateway does not promise delivery order and retries for an hour, so this never reasons
 * about "the previous event": each event names the state it leads to and the states it may
 * replace. An admin's decision (CONFIRMED, REJECTED) is in no `from` list and so is final.
 *
 * No event here marks an order paid. YouPI infers payment from bank SMS and email alerts, and its
 * own documentation says neither an alert nor a signed webhook is proof of settlement.
 */
export function resolveWebhookTransition(
  payload: YoupiWebhookPayload,
  expectedPaise: number,
): WebhookTransition | null {
  const event = typeof payload.event === 'string' ? payload.event : '';
  const claimsMoney =
    event === 'OBSERVED_SUCCESS' ||
    event === 'RECONCILED' ||
    event === 'MANUAL_REVIEW';

  if (claimsMoney) {
    const paise = Number(payload.amountPaise);
    const currency =
      typeof payload.currency === 'string'
        ? payload.currency.toUpperCase()
        : 'INR';
    // A different amount is not this payment, whatever the gateway attributed it to. Held for a
    // person rather than dropped: money did arrive somewhere and somebody has to find out where.
    if (paise !== expectedPaise || currency !== 'INR') {
      return {
        status: 'MANUAL_REVIEW',
        from: ['CREATED', ...ENDED_UNPAID, 'OBSERVED'],
        note: `The gateway reported ${currency} ${
          Number.isFinite(paise)
            ? (paise / 100).toFixed(2)
            : 'an unreadable amount'
        }, but this checkout was opened for INR ${(expectedPaise / 100).toFixed(2)}.`,
      };
    }
  }

  switch (event) {
    case 'OBSERVED_SUCCESS':
      return {
        status: 'OBSERVED',
        from: ['CREATED', ...ENDED_UNPAID],
        note: null,
      };
    case 'RECONCILED':
      // The gateway also reconciles counter and cash-on-delivery sessions; only a UPI one that
      // matched a statement line is what this site sold.
      if (
        payload.method !== 'UPI' ||
        payload.settlementState !== 'RECONCILED'
      ) {
        return null;
      }
      return {
        status: 'RECONCILED',
        from: ['CREATED', ...ENDED_UNPAID, 'OBSERVED', 'MANUAL_REVIEW'],
        note: null,
      };
    case 'MANUAL_REVIEW':
      return {
        status: 'MANUAL_REVIEW',
        from: ['CREATED', ...ENDED_UNPAID, 'OBSERVED'],
        note: 'The gateway could not tie a bank alert to this checkout with certainty.',
      };
    case 'FAILED':
    case 'EXPIRED':
    case 'CANCELLED':
      return { status: event, from: ['CREATED'], note: null };
    default:
      // SUCCESS is the gateway's cash-on-delivery and counter event, which this site never opens.
      return null;
  }
}

@Injectable()
export class OnlinePaymentsService {
  private readonly logger = new Logger(OnlinePaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly orders: OrdersService,
    private readonly youpi: YoupiClient,
  ) {}

  // ---------------------------------------------------------------------------
  // Customer
  // ---------------------------------------------------------------------------

  /** The latest attempt on each of the customer's orders, and whether paying online is offered. */
  async listMine(customerId: string): Promise<MyOnlinePaymentsDto> {
    const attempts = await this.prisma.onlinePayment.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // One per order. An attempt awaiting review wins over a newer one: "we are confirming your
    // payment" is the thing the customer must be told, even if they have since tried again.
    const byOrder = new Map<string, OnlinePayment>();
    for (const attempt of attempts) {
      const kept = byOrder.get(attempt.orderId);
      if (
        !kept ||
        (!AWAITING_REVIEW.includes(kept.status) &&
          AWAITING_REVIEW.includes(attempt.status))
      ) {
        byOrder.set(attempt.orderId, attempt);
      }
    }

    return {
      enabled: this.youpi.isConfigured(),
      payments: [...byOrder.values()].map(toOnlinePaymentDto),
    };
  }

  /**
   * Open a gateway checkout for what an order owes and hand back its address.
   *
   * The amount is the order's own due, read here from the database. Nothing the browser sends
   * decides what is charged.
   */
  async startCheckout(
    orderId: string,
    customerId: string,
  ): Promise<OnlineCheckoutDto> {
    if (!this.youpi.isConfigured()) {
      throw new ServiceUnavailableException(
        'Online payment is not available yet.',
      );
    }

    const order = await this.orders.findOneForCustomer(orderId, customerId);
    const amountPaise = payablePaise(order);

    // An attempt that may still take money has to be settled before another is opened, or the
    // customer can pay the same order twice from two checkout pages.
    const open = await this.prisma.onlinePayment.findMany({
      where: { orderId, status: { in: OPEN } },
      orderBy: { createdAt: 'desc' },
    });
    for (const attempt of open) {
      const current = await this.refreshFromGateway(attempt);
      if (AWAITING_REVIEW.includes(current.status)) {
        throw new ConflictException(
          'We have already received a payment for this order and are confirming it with the bank.',
        );
      }
      if (current.status === 'CREATED') {
        if (current.amountPaise === amountPaise && current.checkoutUrl) {
          return { paymentId: current.id, checkoutUrl: current.checkoutUrl };
        }
        throw new ConflictException(
          'A payment for this order is already open. Please wait a few minutes and try again.',
        );
      }
    }

    const attempt = await this.reserve(order, amountPaise);
    const tracking = order.shipments[0]?.internalTrackingNumber;

    try {
      const session = await this.youpi.createPayment({
        orderId: attempt.id,
        amountPaise,
        returnUrl: `${publicFrontendUrl(this.config)}/orders?payment=${order.id}`,
        description: tracking ? `Shipment ${tracking}` : 'Shipment payment',
        metadata: {
          orderId: order.id,
          ...(tracking ? { trackingNumber: tracking } : {}),
        },
      });
      await this.prisma.onlinePayment.update({
        where: { id: attempt.id },
        data: {
          gatewayPaymentId: session.paymentId,
          checkoutUrl: session.checkoutUrl,
        },
      });
      return { paymentId: attempt.id, checkoutUrl: session.checkoutUrl };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `YouPI checkout for order ${order.id} failed: ${reason}`,
      );
      await this.prisma.onlinePayment.update({
        where: { id: attempt.id },
        data: { status: 'FAILED', note: reason.slice(0, 500) },
      });
      // The gateway refuses new sessions while the phone that reads bank alerts is offline, which
      // is a "not right now", not a fault in the request.
      if (error instanceof YoupiError && error.httpStatus === 503) {
        throw new ServiceUnavailableException(
          'Online payment is paused right now. Please try again in a few minutes.',
        );
      }
      throw new BadGatewayException(
        'We could not open the payment page. Please try again.',
      );
    }
  }

  /**
   * Create the attempt row, refusing if another open one appeared since the check above.
   *
   * The advisory lock is per order and lasts for this transaction only: two taps on "Pay now"
   * in quick succession queue here, and the second finds the first one's row.
   */
  private reserve(
    order: OrderWithShipments,
    amountPaise: number,
  ): Promise<OnlinePayment> {
    return this.prisma.$transaction(async (tx) => {
      // $executeRaw, not $queryRaw: the function returns void, which Prisma cannot read as a row.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${order.id}))`;
      const open = await tx.onlinePayment.count({
        where: { orderId: order.id, status: { in: OPEN } },
      });
      if (open > 0) {
        throw new ConflictException(
          'A payment for this order is already open. Please wait a few minutes and try again.',
        );
      }
      return tx.onlinePayment.create({
        data: {
          orderId: order.id,
          customerId: order.customerId,
          amountPaise,
        },
      });
    });
  }

  /**
   * Ask the gateway where a CREATED attempt really stands. A webhook should already have said,
   * but one that never arrived must not leave an order unpayable, or payable twice.
   */
  private async refreshFromGateway(
    attempt: OnlinePayment,
  ): Promise<OnlinePayment> {
    if (attempt.status !== 'CREATED') return attempt;

    // No gateway id means the create call never came back, so the customer was never shown a
    // checkout page to pay on.
    const reported = attempt.gatewayPaymentId
      ? await this.youpi.fetchStatus(attempt.gatewayPaymentId)
      : 'FAILED';
    const status = statusFromGateway(reported);
    if (!status) return attempt;

    await this.prisma.onlinePayment.updateMany({
      where: { id: attempt.id, status: 'CREATED' },
      data: { status },
    });
    return this.prisma.onlinePayment.findUniqueOrThrow({
      where: { id: attempt.id },
    });
  }

  // ---------------------------------------------------------------------------
  // Gateway webhook
  // ---------------------------------------------------------------------------

  /**
   * Apply one authenticated webhook. Idempotent on the gateway's delivery id.
   *
   * Never throws for a payload it does not recognise: the gateway retries anything that is not a
   * 2xx for an hour, and an event about a session this system never opened will not become
   * recognisable by being sent again.
   */
  async applyWebhook(
    deliveryId: string,
    payload: YoupiWebhookPayload,
  ): Promise<'applied' | 'duplicate' | 'ignored'> {
    const attemptId =
      typeof payload.orderId === 'string' ? payload.orderId : '';
    const attempt = attemptId
      ? await this.prisma.onlinePayment.findUnique({ where: { id: attemptId } })
      : null;
    if (!attempt) {
      this.logger.warn(
        `YouPI webhook ${deliveryId} names an unknown payment (${attemptId || 'no order id'}).`,
      );
      return 'ignored';
    }

    const transition = resolveWebhookTransition(payload, attempt.amountPaise);
    const utr =
      typeof payload.utr === 'string' && payload.utr.trim()
        ? payload.utr.trim().slice(0, 64)
        : null;

    try {
      await this.prisma.$transaction(async (tx) => {
        // First, so a redelivery fails on the primary key before it can change anything.
        await tx.onlinePaymentEvent.create({
          data: {
            id: deliveryId,
            onlinePaymentId: attempt.id,
            event:
              typeof payload.event === 'string' ? payload.event : 'UNKNOWN',
            payload: payload as unknown as Prisma.InputJsonValue,
          },
        });
        if (transition) {
          await tx.onlinePayment.updateMany({
            where: { id: attempt.id, status: { in: transition.from } },
            data: {
              status: transition.status,
              ...(transition.note ? { note: transition.note } : {}),
              ...(utr ? { utr } : {}),
            },
          });
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        return 'duplicate';
      }
      throw error;
    }
    return transition ? 'applied' : 'ignored';
  }

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------

  listForAdmin(scope: 'review' | 'all'): Promise<OnlinePaymentForAdmin[]> {
    return this.prisma.onlinePayment.findMany({
      where: scope === 'review' ? { status: { in: AWAITING_REVIEW } } : {},
      orderBy: { updatedAt: 'desc' },
      take: 200,
      ...withOrderForAdmin,
    });
  }

  /**
   * An admin has seen the money in the bank: mark the order paid.
   *
   * Goes through OrdersService.updatePayment, the same path as "Mark Paid", so the audit entry,
   * the invoice and the receipt are raised exactly as they are for money taken any other way.
   */
  async confirm(id: string, adminId: string): Promise<OnlinePaymentForAdmin> {
    const attempt = await this.findForReview(id);
    const order = await this.orders.findOne(attempt.orderId);

    if (order.paymentStatus === 'PAID') {
      throw new ConflictException(
        'This order is already marked paid. If this money also arrived it is a second payment: refund it, then reject this entry with a note.',
      );
    }
    // Confirming clears the whole due, so it is only offered when this payment is the whole due.
    if (Math.round((order.dueAmount ?? 0) * 100) !== attempt.amountPaise) {
      throw new ConflictException(
        'The amount this order owes has changed since the customer paid. Record the payment with Mark Paid, then reject this entry with a note.',
      );
    }

    // Claimed before the order is touched, so two admins confirming at once cannot both record it.
    const claimed = await this.prisma.onlinePayment.updateMany({
      where: { id, status: { in: AWAITING_REVIEW } },
      data: {
        status: 'CONFIRMED',
        reviewedByAdminId: adminId,
        reviewedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException('This payment has already been reviewed.');
    }

    try {
      await this.orders.updatePayment(
        order.id,
        {
          paymentStatus: 'PAID',
          paymentMethod: 'UPI',
          // What has changed hands in total: anything taken at the door plus this.
          paidAmount: round2(
            (order.paidAmount ?? 0) + attempt.amountPaise / 100,
          ),
          paymentNote: attempt.utr
            ? `Paid online (YouPI). UTR ${attempt.utr}`
            : 'Paid online (YouPI).',
        },
        adminId,
      );
    } catch (error) {
      // The order was not marked paid, so the claim is handed back for another try.
      await this.prisma.onlinePayment.update({
        where: { id },
        data: {
          status: attempt.status,
          reviewedByAdminId: null,
          reviewedAt: null,
        },
      });
      throw error;
    }
    return this.findForAdmin(id);
  }

  /** An admin has checked the bank and the money is not there, or is not for this order. */
  async reject(
    id: string,
    note: string,
    adminId: string,
  ): Promise<OnlinePaymentForAdmin> {
    await this.findForReview(id);
    const claimed = await this.prisma.onlinePayment.updateMany({
      where: { id, status: { in: AWAITING_REVIEW } },
      data: {
        status: 'REJECTED',
        reviewedByAdminId: adminId,
        reviewedAt: new Date(),
        reviewNote: note,
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException('This payment has already been reviewed.');
    }
    return this.findForAdmin(id);
  }

  private async findForReview(id: string): Promise<OnlinePayment> {
    const attempt = await this.prisma.onlinePayment.findUnique({
      where: { id },
    });
    if (!attempt) throw new NotFoundException(`Online payment ${id} not found`);
    if (!AWAITING_REVIEW.includes(attempt.status)) {
      throw new BadRequestException(
        'Only a payment the gateway has reported can be confirmed or rejected.',
      );
    }
    return attempt;
  }

  private findForAdmin(id: string): Promise<OnlinePaymentForAdmin> {
    return this.prisma.onlinePayment.findUniqueOrThrow({
      where: { id },
      ...withOrderForAdmin,
    });
  }
}

/** What the customer may pay online for this order, in paise. Throws when there is nothing. */
export function payablePaise(order: {
  status: string;
  paymentStatus: string;
  dueAmount: number | null;
}): number {
  if (order.status === 'CANCELLED') {
    throw new BadRequestException('This order has been cancelled.');
  }
  if (order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED') {
    throw new BadRequestException('This order has already been paid.');
  }
  const paise = Math.round((order.dueAmount ?? 0) * 100);
  if (paise <= 0) {
    throw new BadRequestException('Nothing is due on this order.');
  }
  return paise;
}

/** The gateway's session status as one of ours, or null while the checkout is still live. */
function statusFromGateway(
  reported: string | null,
): OnlinePaymentStatus | null {
  switch (reported) {
    case 'OBSERVED_SUCCESS':
      return 'OBSERVED';
    case 'RECONCILED':
      return 'RECONCILED';
    // SUCCESS on a UPI session is not something the gateway should say; a person looks at it.
    case 'MANUAL_REVIEW':
    case 'SUCCESS':
      return 'MANUAL_REVIEW';
    case 'FAILED':
    case 'EXPIRED':
    case 'CANCELLED':
      return reported;
    default:
      return null;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
