import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PartnerApplicationsService } from './partner-applications.service';
import { CreatePartnerApplicationDto } from './dto/create-partner-application.dto';

// Unauthenticated by design — this is the public "become a pickup partner" form. It is therefore
// throttled harder than a logged-in endpoint: 3 submissions per IP per 10 minutes. Nobody applies
// four times in ten minutes; a script would.
const APPLICATION_THROTTLE = { default: { limit: 3, ttl: 600_000 } };

/**
 * The public half of partner onboarding. It can create exactly one thing — a PENDING row in
 * partner_applications — and cannot create an account, assign a role, or set a password. The
 * privileged half lives in AdminPartnerApplicationsController behind STAFF/ADMIN.
 */
@Controller('partner-applications')
export class PartnerApplicationsController {
  constructor(private readonly service: PartnerApplicationsService) {}

  @Throttle(APPLICATION_THROTTLE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async apply(
    @Body() dto: CreatePartnerApplicationDto,
  ): Promise<{ message: string }> {
    await this.service.create(dto);
    // Returns no id and no row: an unauthenticated caller has no business reading back what it
    // just wrote, and an id here would be a handle for probing.
    return {
      message:
        'Thanks — your application is with our operations team. We will be in touch by email.',
    };
  }
}
