import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Invoice, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TEMPLATES } from '../notifications/templates';
import { CompanySettingsService } from '../rate-cards/company-settings.service';
import { nextSequenceNumber } from '../shipments/sequence';
import {
  formatInvoiceNumber,
  indianFinancialYear,
  resolveChargedBreakdown,
  round2,
  splitGst,
} from './gst';
import { gstStateCode, isIntraStateSupply } from './indian-states';
import { InvoicePdfService } from './invoice-pdf.service';

const INVOICES_DIR = join(process.cwd(), 'storage', 'invoices');

/** Used only to back-derive a manual quote's tax; see resolveChargedBreakdown. */
const DEFAULT_GST_PERCENT = 18;

/**
 * An order carrying everything an invoice could need. Deliberately one query with includes: a
 * bulk generate over a date range would otherwise fan out into several round trips per order.
 */
const ORDER_FOR_INVOICE = {
  include: {
    customer: true,
    quote: { include: { selectedOption: true } },
    pickupRequest: true,
    shipments: { include: { provider: true } },
  },
} satisfies Prisma.OrderDefaultArgs;

type OrderForInvoice = Prisma.OrderGetPayload<typeof ORDER_FOR_INVOICE>;

export interface GenerateSummary {
  created: string[];
  /** Orders that already had an invoice — generation is idempotent, not an error. */
  skipped: { orderId: string; invoiceId: string }[];
  failed: { orderId: string; reason: string }[];
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly companySettings: CompanySettingsService,
    private readonly invoicePdf: InvoicePdfService,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------------
  // Generating
  // -------------------------------------------------------------------------

  /**
   * Issues invoices for every invoiceable order belonging to the given customers in the given
   * window. Partial success is the norm and is reported rather than thrown: one order missing a
   * price must not stop the other forty from being invoiced.
   */
  async generateForRange(
    customerIds: string[],
    from: Date,
    to: Date,
    actorId: string,
  ): Promise<GenerateSummary> {
    if (from > to) {
      throw new BadRequestException('"from" must not be after "to"');
    }

    const orders = await this.prisma.order.findMany({
      where: {
        customerId: { in: customerIds },
        createdAt: { gte: from, lte: to },
        // Cancelled orders are not supplies and must never be invoiced.
        status: { not: 'CANCELLED' },
      },
      orderBy: { createdAt: 'asc' },
      ...ORDER_FOR_INVOICE,
    });

    const summary: GenerateSummary = { created: [], skipped: [], failed: [] };

    // Sequential, not Promise.all: invoice numbers come from an atomic counter, and issuing in
    // creation order keeps the series in the same order as the supplies it bills. Parallelism
    // would interleave numbers across customers for no real gain at this volume.
    for (const order of orders) {
      try {
        const existing = await this.prisma.invoice.findUnique({
          where: { orderId: order.id },
          select: { id: true },
        });
        if (existing) {
          summary.skipped.push({ orderId: order.id, invoiceId: existing.id });
          continue;
        }
        const invoice = await this.issueForOrder(order, actorId);
        summary.created.push(invoice.id);
      } catch (error) {
        summary.failed.push({
          orderId: order.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return summary;
  }

  /** Single-order entry point; same idempotency guarantee as the bulk path. */
  async generateForOrder(orderId: string, actorId: string): Promise<Invoice> {
    const existing = await this.prisma.invoice.findUnique({
      where: { orderId },
    });
    if (existing) return existing;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      ...ORDER_FOR_INVOICE,
    });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (order.status === 'CANCELLED') {
      throw new BadRequestException('A cancelled order cannot be invoiced');
    }
    return this.issueForOrder(order, actorId);
  }

  /**
   * The supplier fields a tax invoice is not a tax invoice without.
   *
   * Refuse rather than emit a document with blanks where statutory fields belong. This is the one
   * check that must never be softened into a warning: an invoice missing the supplier's GSTIN is
   * not a tax invoice, and issuing it consumes a number in the series regardless. Shared by both
   * issue paths so a one-off invoice cannot slip past the bar the order path enforces.
   */
  private async requireCompleteSettings() {
    const settings = await this.companySettings.get();
    const missing = (
      [
        ['GSTIN', settings.gstin],
        ['legal name', settings.legalName],
        ['address', settings.address],
        ['state', settings.stateName],
        ['state code', settings.stateCode],
        ['SAC code', settings.sacCode],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([label]) => label);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Company ${missing.join(', ')} must be set in Settings before invoices can be issued`,
      );
    }
    return settings;
  }

  /**
   * A one-off invoice with no order behind it — a re-delivery fee, a packaging charge, a
   * correction billed separately. The admin names the customer, the gross amount and what it is
   * for; everything statutory (series, supplier snapshot, CGST/SGST vs IGST) is derived exactly
   * as it is for an order-backed invoice, because an auditor cannot tell the two apart and the
   * document must not either.
   *
   * The amount is TAX-INCLUSIVE, matching the manual-quote path: staff type the number the
   * customer actually pays, and the taxable value is back-derived from it. Typing a pre-tax
   * figure and having the total come out higher than the number quoted is the mistake this
   * avoids.
   */
  async issueCustom(
    input: {
      customerId: string;
      grossAmount: number;
      description: string;
      placeOfSupplyState?: string;
    },
    actorId: string,
  ): Promise<Invoice> {
    const settings = await this.requireCompleteSettings();

    const customer = await this.prisma.customer.findUnique({
      where: { id: input.customerId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer ${input.customerId} not found`);
    }

    const gstPercent =
      this.config.get<number>('INVOICE_GST_PERCENT') ?? DEFAULT_GST_PERCENT;
    const taxableValue = round2(input.grossAmount / (1 + gstPercent / 100));

    // Customer carries only a free-text address, no structured state, so there is nothing
    // reliable to infer from. Falls back to the supplier's own state, which makes the supply
    // intra-state — the same conservative default the order path uses when no origin is
    // recorded. The admin form exposes this field precisely so an inter-state supply can be
    // stated rather than guessed.
    const placeOfSupplyState = input.placeOfSupplyState ?? settings.stateName!;
    const placeOfSupplyCode =
      gstStateCode(placeOfSupplyState) ?? settings.stateCode!;

    const split = splitGst(
      taxableValue,
      // Subtracted rather than computed, so taxable + tax lands exactly on the gross the
      // customer was told.
      round2(input.grossAmount - taxableValue),
      isIntraStateSupply(settings.stateCode, placeOfSupplyCode),
    );

    const invoiceDate = new Date();
    const financialYear = indianFinancialYear(invoiceDate);
    const sequence = await nextSequenceNumber(
      this.prisma,
      `invoice:${financialYear}`,
    );

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber: formatInvoiceNumber(sequence, financialYear),
        sequenceNumber: sequence,
        financialYear,
        orderId: null,
        customerId: customer.id,
        customLineDescription: input.description,
        invoiceDate,

        supplierName: settings.legalName!,
        supplierGstin: settings.gstin!,
        supplierAddress: settings.address!,
        supplierStateName: settings.stateName!,
        supplierStateCode: settings.stateCode!,
        supplierEmail: settings.supportEmail,
        supplierPhone: settings.supportPhone,

        recipientName: customer.name,
        recipientPhone: customer.phone,
        recipientGstin: customer.gstin,
        recipientAddress: customer.address,

        placeOfSupplyState,
        placeOfSupplyCode,
        sacCode: settings.sacCode!,

        taxableValue,
        ...split,
        nonTaxableCharges: 0,
        totalAmount: round2(input.grossAmount),
        breakdownSource: 'CUSTOM',
        issuedByAdminId: actorId,
      },
    });

    const pdfPath = await this.storePdf(
      invoice,
      { shipments: [], destination: null, weightKg: null },
      settings.logoPath,
    );

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'INVOICE_ISSUED',
        entity: 'Invoice',
        entityId: invoice.id,
        before: {},
        after: {
          invoiceNumber: invoice.invoiceNumber,
          customerId: customer.id,
          totalAmount: invoice.totalAmount,
          breakdownSource: 'CUSTOM',
        },
      },
    });

    return this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { pdfPath },
    });
  }

  /** A customer's own bills. Scoped by customerId, never by a client-supplied filter. */
  listForCustomer(customerId: string): Promise<Invoice[]> {
    return this.prisma.invoice.findMany({
      where: { customerId },
      orderBy: { invoiceDate: 'desc' },
    });
  }

  /**
   * Same as readPdf, but proves the invoice belongs to the caller first. A customer route must
   * never reach readPdf directly — invoice ids are uuids, but "hard to guess" is not access
   * control, and this is somebody's tax document.
   */
  async readPdfForCustomer(
    id: string,
    customerId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.findOne(id);
    if (invoice.customerId !== customerId) {
      // 404, not 403: a 403 would confirm the invoice exists.
      throw new NotFoundException(`Invoice ${id} not found`);
    }
    return this.readPdf(id);
  }

  private async issueForOrder(
    order: OrderForInvoice,
    actorId: string,
  ): Promise<Invoice> {
    const settings = await this.requireCompleteSettings();

    const breakdown = resolveChargedBreakdown({
      verified: order.pickupRequest
        ? {
            taxableSubtotal: order.pickupRequest.verifiedTaxableSubtotal,
            gstAmount: order.pickupRequest.verifiedGstAmount,
            nationwideCut: order.pickupRequest.verifiedNationwideCut,
            price: order.pickupRequest.verifiedPrice,
          }
        : null,
      rateOption: order.quote?.selectedOption ?? null,
      manualGrossAmount: order.quote?.quotedAmount ?? order.paidAmount ?? null,
      fallbackGstPercent: DEFAULT_GST_PERCENT,
    });
    if (!breakdown) {
      throw new BadRequestException(
        'Order has no priced amount to invoice — quote it or record a payment first',
      );
    }

    // Place of supply for a courier is where the goods are handed over, which is the pickup
    // address. Falls back to the quote's origin (admin manual flow), then to the supplier's own
    // state — the last of which makes it intra-state, the conservative default when the origin
    // genuinely isn't recorded anywhere.
    const placeOfSupplyState =
      order.pickupRequest?.pickupState ??
      order.quote?.originState ??
      settings.stateName!;
    const placeOfSupplyCode =
      gstStateCode(placeOfSupplyState) ?? settings.stateCode!;

    const split = splitGst(
      breakdown.taxableValue,
      breakdown.gstAmount,
      isIntraStateSupply(settings.stateCode, placeOfSupplyCode),
    );

    const invoiceDate = new Date();
    const financialYear = indianFinancialYear(invoiceDate);
    // Counter is per financial year, because the series restarts each year.
    const sequence = await nextSequenceNumber(
      this.prisma,
      `invoice:${financialYear}`,
    );

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber: formatInvoiceNumber(sequence, financialYear),
        sequenceNumber: sequence,
        financialYear,
        orderId: order.id,
        customerId: order.customerId,
        invoiceDate,

        supplierName: settings.legalName!,
        supplierGstin: settings.gstin!,
        supplierAddress: settings.address!,
        supplierStateName: settings.stateName!,
        supplierStateCode: settings.stateCode!,
        supplierEmail: settings.supportEmail,
        supplierPhone: settings.supportPhone,

        recipientName: order.customer.name,
        recipientPhone: order.customer.phone,
        recipientGstin: order.customer.gstin,
        recipientAddress: order.customer.address,

        placeOfSupplyState,
        placeOfSupplyCode,
        sacCode: settings.sacCode!,

        taxableValue: breakdown.taxableValue,
        ...split,
        nonTaxableCharges: breakdown.nonTaxableCharges,
        totalAmount: breakdown.totalAmount,
        breakdownSource: breakdown.source,
        issuedByAdminId: actorId,
      },
    });

    // Rendered once, at issue time, and served from disk forever after. Re-rendering on each
    // download would let a template change silently alter a document already sent to a customer
    // and filed with their accountant.
    const pdfPath = await this.renderAndStorePdf(
      invoice,
      order,
      settings.logoPath,
    );

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'INVOICE_ISSUED',
        entity: 'Invoice',
        entityId: invoice.id,
        before: {},
        after: {
          invoiceNumber: invoice.invoiceNumber,
          orderId: order.id,
          totalAmount: invoice.totalAmount,
          breakdownSource: invoice.breakdownSource,
        },
      },
    });

    return this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { pdfPath },
    });
  }

  private renderAndStorePdf(
    invoice: Invoice,
    order: OrderForInvoice,
    logoPath: string | null,
  ): Promise<string> {
    return this.storePdf(
      invoice,
      {
        shipments: order.shipments.map((shipment) => ({
          trackingNumber: shipment.internalTrackingNumber,
          providerName: shipment.provider.name,
        })),
        destination: order.quote
          ? `${order.quote.destCity}, ${order.quote.destCountry}`
          : null,
        weightKg:
          order.pickupRequest?.verifiedWeightKg ??
          order.pickupRequest?.estimatedWeightKg ??
          order.quote?.weightKg ??
          null,
      },
      logoPath,
    );
  }

  /** Renders and writes the PDF once, at issue time. Shared by both issue paths. */
  private async storePdf(
    invoice: Invoice,
    extras: Parameters<InvoicePdfService['render']>[1],
    logoPath: string | null,
  ): Promise<string> {
    const buffer = await this.invoicePdf.render(invoice, extras, logoPath);

    await mkdir(INVOICES_DIR, { recursive: true });
    const relativePath = join('invoices', `${invoice.id}.pdf`);
    await writeFile(join(process.cwd(), 'storage', relativePath), buffer);
    // Stored with forward slashes so the path is identical on Windows dev and Linux prod — it
    // ends up in a URL, and a backslash there is not the same character.
    return relativePath.split(/[\\/]/).join('/');
  }

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  async list(filters: {
    customerIds?: string[];
    from?: Date;
    to?: Date;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.InvoiceWhereInput = {};
    if (filters.customerIds?.length) {
      where.customerId = { in: filters.customerIds };
    }
    if (filters.from || filters.to) {
      where.invoiceDate = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { invoiceDate: 'desc' },
        skip: filters.skip ?? 0,
        take: filters.take ?? 50,
        include: { customer: { select: { name: true, phone: true } } },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(id: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
    return invoice;
  }

  async readPdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.findOne(id);
    if (!invoice.pdfPath) {
      throw new NotFoundException(
        `Invoice ${invoice.invoiceNumber} has no rendered PDF`,
      );
    }
    const buffer = await readFile(
      join(process.cwd(), 'storage', invoice.pdfPath),
    );
    return { buffer, filename: this.filenameFor(invoice) };
  }

  /** Slashes are illegal in filenames and the invoice number is full of them. */
  filenameFor(invoice: Invoice): string {
    return `${invoice.invoiceNumber.replace(/\//g, '-')}.pdf`;
  }

  // -------------------------------------------------------------------------
  // Public signed links
  // -------------------------------------------------------------------------

  /**
   * WhatsApp cannot use the authenticated admin download route: Meta's servers fetch the media
   * themselves and carry no session. So the link handed to them is unguessable instead of
   * authenticated — an HMAC of the invoice id under the app's signing secret.
   *
   * Deliberately NOT time-limited. The customer keeps this message as their copy of a tax
   * document, and a link that dies in an hour makes the attachment worthless a week later. The
   * security property being relied on is that the token cannot be forged or enumerated.
   */
  signatureFor(invoiceId: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    )
      .update(`invoice:${invoiceId}`)
      .digest('hex');
  }

  verifySignature(invoiceId: string, token: string): boolean {
    const expected = Buffer.from(this.signatureFor(invoiceId));
    const provided = Buffer.from(token);
    // Length check first: timingSafeEqual throws rather than returning false on a length
    // mismatch, which would turn a malformed token into a 500.
    return (
      expected.length === provided.length && timingSafeEqual(expected, provided)
    );
  }

  publicUrlFor(invoice: Invoice): string {
    const base = this.config
      .getOrThrow<string>('PUBLIC_BASE_URL')
      .replace(/\/+$/, '');
    return `${base}/api/v1/public/invoices/${invoice.id}/${this.signatureFor(invoice.id)}`;
  }

  // -------------------------------------------------------------------------
  // Sending
  // -------------------------------------------------------------------------

  /**
   * Queues the invoice to the customer over WhatsApp as a document attachment.
   *
   * sentAt is set when the job is ACCEPTED, not when it is delivered — actual delivery arrives
   * later on the status webhook and lands on the Notification row, which is where per-message
   * delivery state belongs. Storing "delivered" here too would give two sources of truth.
   */
  async sendToWhatsApp(id: string): Promise<Invoice> {
    const invoice = await this.findOne(id);
    if (invoice.status === 'CANCELLED') {
      throw new BadRequestException('A cancelled invoice cannot be sent');
    }
    if (!invoice.pdfPath) {
      throw new BadRequestException(
        'Invoice has no rendered PDF to send — re-generate it first',
      );
    }

    await this.notifications.enqueue(
      invoice.customerId,
      'WHATSAPP',
      NOTIFICATION_TEMPLATES.INVOICE_READY,
      {
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.totalAmount.toFixed(2),
        customerName: invoice.recipientName,
      },
      { url: this.publicUrlFor(invoice), filename: this.filenameFor(invoice) },
    );

    return this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { sentAt: new Date() },
    });
  }

  /** Bulk send; same partial-success reporting as generation. */
  async sendMany(ids: string[]): Promise<GenerateSummary> {
    const summary: GenerateSummary = { created: [], skipped: [], failed: [] };
    for (const id of ids) {
      try {
        await this.sendToWhatsApp(id);
        summary.created.push(id);
      } catch (error) {
        summary.failed.push({
          orderId: id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return summary;
  }

  // -------------------------------------------------------------------------
  // Cancelling
  // -------------------------------------------------------------------------

  /**
   * Invoices are never deleted. GST requires the series to be unbroken, so a mistake is
   * CANCELLED in place — the number stays consumed and the document stays on file. A missing
   * number is the thing an auditor asks about.
   */
  async cancel(id: string, reason: string, actorId: string): Promise<Invoice> {
    const invoice = await this.findOne(id);
    if (invoice.status === 'CANCELLED') return invoice;

    const cancelled = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'INVOICE_CANCELLED',
        entity: 'Invoice',
        entityId: id,
        before: { status: invoice.status },
        after: { status: 'CANCELLED', reason },
      },
    });

    return cancelled;
  }
}
