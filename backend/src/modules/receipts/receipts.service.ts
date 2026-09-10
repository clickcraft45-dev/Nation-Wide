import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentMethod, Prisma, Receipt } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../database/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TEMPLATES } from '../notifications/templates';
import { CompanySettingsService } from '../rate-cards/company-settings.service';
import { nextSequenceNumber } from '../shipments/sequence';
import { formatInvoiceNumber, indianFinancialYear } from '../invoices/gst';
import { ReceiptPdfService } from './receipt-pdf.service';

/**
 * Payment receipts — the acknowledgement that money arrived.
 *
 * SEPARATE FROM INVOICES on purpose. An invoice is a demand and is a tax document the moment it
 * is issued; a receipt says the payment landed. They are raised at different moments by
 * different people (an admin marking a bank transfer, a partner taking cash at the door), they
 * carry their own numbering series, and "proof I paid" is this document, not the invoice.
 *
 * ISSUING NEVER BLOCKS A PAYMENT. Every call site here is invoked after the payment has already
 * been written, and failures are logged rather than thrown: the payment is the fact being
 * recorded, and it must not roll back because a PDF failed to render or the company's address
 * is not filled in yet. Same rule InvoicesService's auto-issue follows.
 */
@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly companySettings: CompanySettingsService,
    private readonly receiptPdf: ReceiptPdfService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  // -------------------------------------------------------------------------
  // Issuing
  // -------------------------------------------------------------------------

  /**
   * Issues the receipt for a payment recorded against an order.
   *
   * IDEMPOTENT PER ORDER PAYMENT. An order that is marked paid twice (a correction, a retried
   * request) must not hand the customer two receipts for one payment, so an existing receipt
   * for the same order and amount is returned as-is. A genuinely different amount is a
   * different payment and does get its own receipt.
   *
   * Unlike an invoice this needs no GSTIN or SAC — a receipt is not a tax document — so it can
   * still issue on an account whose statutory settings are incomplete. That is deliberate: it is
   * exactly when invoicing is blocked that the customer most needs something proving they paid.
   */
  async issueForOrderPayment(
    orderId: string,
    actorId: string,
  ): Promise<Receipt | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        invoice: { select: { id: true, invoiceNumber: true } },
        shipments: { select: { internalTrackingNumber: true } },
      },
    });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (order.paymentStatus !== 'PAID') {
      throw new BadRequestException(
        'A receipt can only be issued for a paid order',
      );
    }

    const amount = order.paidAmount;
    if (amount === null || amount <= 0) {
      throw new BadRequestException(
        'Order is marked paid but carries no amount — record the amount first',
      );
    }

    const existing = await this.prisma.receipt.findFirst({
      where: { orderId, amount },
    });
    if (existing) return existing;

    const settings = await this.companySettings.get();
    const receipt = await this.create({
      customerId: order.customerId,
      orderId: order.id,
      invoiceId: order.invoice?.id ?? null,
      amount,
      // CASH is the fallback because it is what a partner collects at the door, which is the one
      // path that can reach here without an explicit method recorded.
      paymentMethod: order.paymentMethod ?? 'CASH',
      receivedAt: order.paidAt ?? new Date(),
      recipientName: order.customer.name,
      recipientPhone: order.customer.phone,
      settings,
      actorId,
      extras: {
        invoiceNumber: order.invoice?.invoiceNumber ?? null,
        trackingNumbers: order.shipments.map((s) => s.internalTrackingNumber),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'RECEIPT_ISSUED',
        entity: 'Receipt',
        entityId: receipt.id,
        before: {},
        after: {
          receiptNumber: receipt.receiptNumber,
          orderId,
          amount: receipt.amount,
        },
      },
    });

    return receipt;
  }

  /**
   * Issues the receipt for a payment settling a consolidated invoice — many orders, one payment.
   * No orderId, because no single order owns it; the invoice it settles is the link.
   */
  async issueForInvoice(
    invoiceId: string,
    amount: number,
    paymentMethod: PaymentMethod,
    receivedAt: Date,
    actorId: string,
  ): Promise<Receipt> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        lines: { select: { description: true } },
      },
    });
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);
    if (invoice.status === 'CANCELLED') {
      throw new BadRequestException(
        'A cancelled invoice cannot have a payment receipted against it',
      );
    }

    const settings = await this.companySettings.get();
    const receipt = await this.create({
      customerId: invoice.customerId,
      orderId: null,
      invoiceId: invoice.id,
      amount,
      paymentMethod,
      receivedAt,
      recipientName: invoice.recipientName,
      recipientPhone: invoice.recipientPhone,
      settings,
      actorId,
      extras: {
        invoiceNumber: invoice.invoiceNumber,
        trackingNumbers: [],
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'RECEIPT_ISSUED',
        entity: 'Receipt',
        entityId: receipt.id,
        before: {},
        after: {
          receiptNumber: receipt.receiptNumber,
          invoiceId,
          amount: receipt.amount,
        },
      },
    });

    return receipt;
  }

  /** The shared write: allocate a number, snapshot the parties, render, store. */
  private async create(input: {
    customerId: string;
    orderId: string | null;
    invoiceId: string | null;
    amount: number;
    paymentMethod: PaymentMethod;
    receivedAt: Date;
    recipientName: string;
    recipientPhone: string;
    settings: {
      legalName: string | null;
      gstin: string | null;
      address: string | null;
      companyName?: string | null;
      tagline?: string | null;
      primaryColor?: string | null;
      logoPath?: string | null;
      website?: string | null;
      supportEmail?: string | null;
      supportPhone?: string | null;
      footerNotes?: string | null;
    };
    actorId: string;
    extras: { invoiceNumber: string | null; trackingNumbers: string[] };
  }): Promise<Receipt> {
    const { settings } = input;
    const financialYear = indianFinancialYear(input.receivedAt);
    // Its own counter, not the invoice one: the two series are independent and a receipt must
    // never consume a number out of the invoice sequence, which has to stay unbroken.
    const sequence = await nextSequenceNumber(
      this.prisma,
      `receipt:${financialYear}`,
    );

    const receipt = await this.prisma.receipt.create({
      data: {
        receiptNumber: formatInvoiceNumber(sequence, financialYear, 'RCP'),
        sequenceNumber: sequence,
        financialYear,
        customerId: input.customerId,
        orderId: input.orderId,
        invoiceId: input.invoiceId,

        // Falls back to the trading name and a placeholder address rather than refusing: unlike
        // an invoice, a receipt has no statutory minimum it can fail to meet.
        supplierName:
          settings.legalName ?? settings.companyName ?? 'NationWide Logistics',
        supplierGstin: settings.gstin,
        supplierAddress: settings.address ?? '—',

        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone,

        amount: Math.round(input.amount * 100) / 100,
        paymentMethod: input.paymentMethod,
        receivedAt: input.receivedAt,
        recordedByAdminId: input.actorId,
      },
    });

    const pdfPath = await this.renderAndStore(receipt, input.extras, settings);
    return this.prisma.receipt.update({
      where: { id: receipt.id },
      data: { pdfPath },
    });
  }

  private async renderAndStore(
    receipt: Receipt,
    extras: { invoiceNumber: string | null; trackingNumbers: string[] },
    branding: {
      companyName?: string | null;
      tagline?: string | null;
      primaryColor?: string | null;
      logoPath?: string | null;
      website?: string | null;
      supportEmail?: string | null;
      supportPhone?: string | null;
      footerNotes?: string | null;
    },
  ): Promise<string> {
    const buffer = await this.receiptPdf.render(receipt, extras, branding);
    // Partitioned by the receipt's own date, so a year's receipts list under one prefix and a
    // back-dated entry lands in the period it belongs to.
    const date = receipt.receivedAt;
    const key = `receipts/${date.getUTCFullYear()}/${String(
      date.getUTCMonth() + 1,
    ).padStart(2, '0')}/${this.filenameFor(receipt)}`;
    await this.storage.put(key, buffer, 'application/pdf');
    return key;
  }

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  async list(filters: {
    customerId?: string;
    from?: Date;
    to?: Date;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.ReceiptWhereInput = {};
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.from || filters.to) {
      where.receivedAt = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.receipt.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip: filters.skip ?? 0,
        take: filters.take ?? 50,
        include: {
          customer: { select: { name: true, phone: true } },
          invoice: { select: { invoiceNumber: true } },
        },
      }),
      this.prisma.receipt.count({ where }),
    ]);
    return { items, total };
  }

  listForCustomer(customerId: string) {
    return this.prisma.receipt.findMany({
      where: { customerId },
      orderBy: { receivedAt: 'desc' },
      include: { invoice: { select: { invoiceNumber: true } } },
    });
  }

  async findOne(id: string): Promise<Receipt> {
    const receipt = await this.prisma.receipt.findUnique({ where: { id } });
    if (!receipt) throw new NotFoundException(`Receipt ${id} not found`);
    return receipt;
  }

  async readPdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const receipt = await this.findOne(id);
    if (!receipt.pdfPath) {
      throw new NotFoundException(
        `Receipt ${receipt.receiptNumber} has no rendered PDF`,
      );
    }
    return {
      buffer: await this.storage.get(receipt.pdfPath),
      filename: this.filenameFor(receipt),
    };
  }

  /**
   * The same read, scoped to one customer. 404 rather than 403 on someone else's receipt: a
   * distinguishable "exists but not yours" confirms which receipt ids are real.
   */
  async readPdfForCustomer(
    id: string,
    customerId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const receipt = await this.prisma.receipt.findFirst({
      where: { id, customerId },
    });
    if (!receipt?.pdfPath) {
      throw new NotFoundException(`Receipt ${id} not found`);
    }
    return {
      buffer: await this.storage.get(receipt.pdfPath),
      filename: this.filenameFor(receipt),
    };
  }

  /** Slashes are illegal in filenames and the receipt number is full of them. */
  filenameFor(receipt: Receipt): string {
    return `${receipt.receiptNumber.replace(/\//g, '-')}.pdf`;
  }

  // -------------------------------------------------------------------------
  // Sharing
  // -------------------------------------------------------------------------

  /**
   * Same unguessable-link scheme as invoices, and for the same reason: WhatsApp document
   * delivery works by handing Meta a URL that Meta's own servers fetch, carrying no session.
   * The token is an HMAC of the receipt id, namespaced `receipt:` so a leaked invoice token can
   * never be replayed against a receipt of the same id.
   */
  signatureFor(receiptId: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    )
      .update(`receipt:${receiptId}`)
      .digest('hex');
  }

  verifySignature(receiptId: string, token: string): boolean {
    const expected = Buffer.from(this.signatureFor(receiptId));
    const provided = Buffer.from(token);
    // Length first: timingSafeEqual throws on a length mismatch, turning a malformed token into
    // a 500 rather than a 404.
    return (
      expected.length === provided.length && timingSafeEqual(expected, provided)
    );
  }

  publicUrlFor(receipt: Receipt): string {
    const base = this.config
      .getOrThrow<string>('PUBLIC_BASE_URL')
      .replace(/\/+$/, '');
    return `${base}/api/v1/public/receipts/${receipt.id}/${this.signatureFor(receipt.id)}`;
  }

  /** Queues the receipt to the customer over WhatsApp as a document attachment. */
  async sendToWhatsApp(id: string): Promise<Receipt> {
    const receipt = await this.findOne(id);
    if (!receipt.pdfPath) {
      throw new BadRequestException(
        'Receipt has no rendered PDF to send — re-issue it first',
      );
    }

    await this.notifications.enqueue(
      receipt.customerId,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.RECEIPT_READY,
      {
        receiptNumber: receipt.receiptNumber,
        amount: receipt.amount.toFixed(2),
        customerName: receipt.recipientName,
      },
      { url: this.publicUrlFor(receipt), filename: this.filenameFor(receipt) },
    );

    return this.prisma.receipt.update({
      where: { id: receipt.id },
      data: { sentAt: new Date() },
    });
  }

  /**
   * Issue and send in one step, swallowing failure.
   *
   * This is what the payment paths call. Both halves are best-effort by design: the payment is
   * already recorded and committed, and neither a PDF render nor a WhatsApp queue is worth
   * failing that write over. Anything that lands here unreceipted is recoverable from the admin
   * screen, which is why the manual issue endpoint exists.
   */
  async issueAndSendQuietly(orderId: string, actorId: string): Promise<void> {
    try {
      const receipt = await this.issueForOrderPayment(orderId, actorId);
      if (receipt) await this.sendToWhatsApp(receipt.id);
    } catch (error) {
      this.logger.warn(
        `Order ${orderId} was paid but its receipt could not be issued: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
