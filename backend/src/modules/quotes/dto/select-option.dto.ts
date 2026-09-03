import { IsUUID } from 'class-validator';

export class SelectOptionDto {
  @IsUUID()
  optionId!: string;
}
