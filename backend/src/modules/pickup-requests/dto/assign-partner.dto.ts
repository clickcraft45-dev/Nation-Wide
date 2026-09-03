import { IsUUID } from 'class-validator';

export class AssignPartnerDto {
  @IsUUID()
  partnerId!: string;
}
