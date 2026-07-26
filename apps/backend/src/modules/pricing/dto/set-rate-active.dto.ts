import { IsBoolean } from 'class-validator';

export class SetRateActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
