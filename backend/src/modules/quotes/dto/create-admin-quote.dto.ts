import { IsIn, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import {
  FULFILLMENT_METHODS,
  type FulfillmentMethodCode,
} from '@nationwide/shared-types';
import { CreateQuoteDto } from './create-quote.dto';
import { QuoteOriginAddressDto } from './quote-address.dto';

// Staff-initiated quote creation (Admin "Get a Quote") — identical to the customer-facing
// CreateQuoteDto plus an explicit target customer, since there's no JWT subject to imply it
// the way there is for a customer's own POST /quotes. Deliberately extends rather than
// duplicates CreateQuoteDto's fields/validators, so the two paths can never drift apart.
//
// origin/fulfillmentMethod are re-required here (CreateQuoteDto itself made them optional for
// the new customer self-service pickup-request flow) — this admin path always collects full
// logistics upfront, and keeping them required here is exactly what keeps
// Quote.fulfillmentMethod set, which is the discriminator QuotesService.selectOption/acceptQuote
// use to stay on the legacy immediate-order-creation behavior.
export class CreateAdminQuoteDto extends CreateQuoteDto {
  @IsUUID()
  customerId!: string;

  @ValidateNested()
  @Type(() => QuoteOriginAddressDto)
  declare origin: QuoteOriginAddressDto;

  @IsIn(FULFILLMENT_METHODS)
  declare fulfillmentMethod: FulfillmentMethodCode;
}
