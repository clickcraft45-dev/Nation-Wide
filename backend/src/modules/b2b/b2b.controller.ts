import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import type {
  B2bOrderResultDto,
  InvoiceDto,
  B2bRequestSummaryDto,
  B2bSessionDto,
  CountryDto,
  QuotePreviewResultDto,
  SavedItemDto,
} from '@nationwide/shared-types';
import { AddressBookService } from '../customers/address-book.service';
import { CustomersService, type PublicCustomer } from '../customers/customers.service';
import { InvoicesService } from '../invoices/invoices.service';
import { toInvoiceDto } from '../invoices/invoice.mapper';
import { SaveItemDto } from '../customers/dto/save-item.dto';
import { CountriesService } from '../pricing/countries.service';
import { toCountryDto } from '../pricing/country.mapper';
import { QuotesService } from '../quotes/quotes.service';
import { QuotePreviewQueryDto } from '../quotes/dto/quote-preview.dto';
import { PickupRequestsService } from '../pickup-requests/pickup-requests.service';
import { B2bCreateOrdersDto } from '../pickup-requests/dto/b2b-create-orders.dto';
import { B2bAccessGuard, type B2bRequest } from './b2b-access.guard';

// Reachable by anyone holding the link, so every route is throttled. Booking writes rows and runs
// the pricing engine once per shipment, so it is tighter than the reads.
const READ_THROTTLE = { default: { limit: 60, ttl: 60_000 } };
const BOOK_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

/**
 * The B2B order portal: a business booking shipments for itself. Reached either by signing in with
 * a business account or through a standing link handed to a despatch desk — see B2bAccessGuard,
 * which resolves both to one customer. Everything here is scoped to that customer; the client
 * never supplies a customer id, so one caller can never reach another business's data.
 */
@Controller('b2b')
@UseGuards(B2bAccessGuard)
export class B2bController {
  constructor(
    private readonly pickupRequests: PickupRequestsService,
    private readonly addressBook: AddressBookService,
    private readonly countries: CountriesService,
    private readonly quotes: QuotesService,
    private readonly customers: CustomersService,
    private readonly invoices: InvoicesService,
  ) {}

  /** Who the link belongs to, plus their reusable addresses, recipients and items. */
  @Throttle(READ_THROTTLE)
  @Get('session')
  async session(@Req() req: B2bRequest): Promise<B2bSessionDto> {
    const { customerId, label } = req.b2b!;
    const [customer, addressBook] = await Promise.all([
      this.pickupRequests.customerName(customerId),
      this.addressBook.get(customerId),
    ]);
    return { customerName: customer, linkLabel: label, addressBook };
  }

  @Throttle(READ_THROTTLE)
  @Get('countries')
  async listCountries(): Promise<CountryDto[]> {
    const countries = await this.countries.findAllActive();
    return countries.map(toCountryDto);
  }

  // The same stateless pricing preview the customer wizard uses — nothing is persisted.
  @Throttle(READ_THROTTLE)
  @Get('preview')
  preview(
    @Query() query: QuotePreviewQueryDto,
  ): Promise<QuotePreviewResultDto> {
    return this.quotes.preview(query);
  }

  /** Book the batch: one pickup, many shipments. */
  @Throttle(BOOK_THROTTLE)
  @Post('orders')
  createOrders(
    @Req() req: B2bRequest,
    @Body() dto: B2bCreateOrdersDto,
  ): Promise<B2bOrderResultDto[]> {
    return this.pickupRequests.createBatchForCustomer(req.b2b!.customerId, dto);
  }

  /** What this business has already requested, so the team can see where each shipment is. */
  @Throttle(READ_THROTTLE)
  @Get('orders')
  listOrders(@Req() req: B2bRequest): Promise<B2bRequestSummaryDto[]> {
    return this.pickupRequests.summariesForCustomer(req.b2b!.customerId);
  }

  /** The business's own details, for the portal's profile tab. */
  @Throttle(READ_THROTTLE)
  @Get('profile')
  profile(@Req() req: B2bRequest): Promise<PublicCustomer> {
    return this.customers.findOne(req.b2b!.customerId);
  }

  /** Every tax invoice issued to this business — the same rows their account's /documents shows. */
  @Throttle(READ_THROTTLE)
  @Get('invoices')
  async listInvoices(@Req() req: B2bRequest): Promise<InvoiceDto[]> {
    const invoices = await this.invoices.listForCustomer(req.b2b!.customerId);
    return invoices.map(toInvoiceDto);
  }

  // readPdfForCustomer, not readPdf: it 404s on an invoice belonging to anyone else, so a link
  // token can only ever pull down its own business's tax documents.
  @Throttle(READ_THROTTLE)
  @Get('invoices/:id/pdf')
  async invoicePdf(
    @Req() req: B2bRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.invoices.readPdfForCustomer(
      id,
      req.b2b!.customerId,
    );
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      })
      .end(buffer);
  }

  // The saved-items library, editable from the portal: the same rows the customer's own account
  // and staff booking screens use.
  @Throttle(BOOK_THROTTLE)
  @Post('saved-items')
  createSavedItem(
    @Req() req: B2bRequest,
    @Body() dto: SaveItemDto,
  ): Promise<SavedItemDto> {
    return this.addressBook.create(req.b2b!.customerId, dto);
  }

  @Throttle(BOOK_THROTTLE)
  @Patch('saved-items/:itemId')
  updateSavedItem(
    @Req() req: B2bRequest,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: SaveItemDto,
  ): Promise<SavedItemDto> {
    return this.addressBook.update(req.b2b!.customerId, itemId, dto);
  }

  @Throttle(BOOK_THROTTLE)
  @Delete('saved-items/:itemId')
  @HttpCode(204)
  removeSavedItem(
    @Req() req: B2bRequest,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    return this.addressBook.remove(req.b2b!.customerId, itemId);
  }
}
