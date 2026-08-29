import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { PincodeLookupDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PincodesService } from './pincodes.service';

// Any authenticated role — the customer quote and pickup-request forms both verify the PIN a
// customer types, and staff do the same on the manual-quote form.
@Controller('pincodes')
@UseGuards(JwtAuthGuard)
export class PincodesController {
  constructor(private readonly pincodesService: PincodesService) {}

  // Stricter than the global 300/min: each keystroke past six digits is a potential call, and
  // this route proxies a third-party API we don't own.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':pincode')
  lookup(@Param('pincode') pincode: string): Promise<PincodeLookupDto> {
    return this.pincodesService.lookup(pincode);
  }
}
