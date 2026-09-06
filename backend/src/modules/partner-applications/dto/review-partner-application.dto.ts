import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Approving an application creates a real PICKUP_PARTNER account, so the admin supplies its
 * initial password here — the same 10-character minimum as every other credential in the app
 * (see RegisterDto). The applicant never chooses it and it is never stored in plaintext.
 */
export class ApprovePartnerApplicationDto {
  @IsString()
  @MinLength(10)
  password!: string;

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
