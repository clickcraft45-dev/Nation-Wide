import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateOrderDto {
  @IsUUID()
  customerId!: string;

  // Defaults to 'ICL' when omitted — see Section 12: today there is exactly one
  // downstream partner, but the field exists so multi-provider isn't a schema change later.
  @IsOptional()
  @IsString()
  providerCode?: string;
}
