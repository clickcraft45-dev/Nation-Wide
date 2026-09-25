import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** Whether the parcel behind a cancelled order has come back to the customer. */
export class SetOrderReturnedDto {
  @IsBoolean()
  returned!: boolean;

  /** Kept only while `returned` is true — see OrdersService.setReturned. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
