import { IsUUID } from 'class-validator';
import { CreateQuoteDto } from './create-quote.dto';

// Staff-initiated quote creation (Admin "Get a Quote") — identical to the customer-facing
// CreateQuoteDto plus an explicit target customer, since there's no JWT subject to imply it
// the way there is for a customer's own POST /quotes. Deliberately extends rather than
// duplicates CreateQuoteDto's fields/validators, so the two paths can never drift apart.
export class CreateAdminQuoteDto extends CreateQuoteDto {
  @IsUUID()
  customerId!: string;
}
