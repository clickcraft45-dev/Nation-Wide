import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Approving an application creates a real PICKUP_PARTNER account. No password field: the service
 * generates one and emails it to the applicant, so the credential never passes through an admin
 * (and never through whatever chat app they were relaying it over).
 */
export class ApprovePartnerApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}

export class RejectPartnerApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}
