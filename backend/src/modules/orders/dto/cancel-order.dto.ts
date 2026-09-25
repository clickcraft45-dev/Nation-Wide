import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelOrderDto {
  // Optional: a customer cancelling a pickup they no longer need has nothing to explain, and
  // demanding a reason only produces "." in the box.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
