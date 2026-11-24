import {
  IsNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * A discount the partner gives at the door, in rupees off. Anything above zero needs the admin
 * who approved it and a reason; zero takes back a discount already given.
 */
export class DoorDiscountDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  amount!: number;

  @ValidateIf((dto: DoorDiscountDto) => dto.amount > 0)
  @IsUUID()
  approvedByAdminId?: string;

  @ValidateIf((dto: DoorDiscountDto) => dto.amount > 0)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason?: string;
}
