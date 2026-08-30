import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
} from 'class-validator';

export class SendInvoicesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  invoiceIds!: string[];
}
