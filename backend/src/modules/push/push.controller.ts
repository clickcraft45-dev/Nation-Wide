import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsString, MaxLength, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import {
  isPushServiceEndpoint,
  PushService,
  type PushOwner,
} from './push.service';

class PushKeysDto {
  @IsString()
  @MaxLength(200)
  p256dh!: string;

  @IsString()
  @MaxLength(100)
  auth!: string;
}

/** The subset of the browser's PushSubscription.toJSON() the server needs. */
export class PushSubscriptionDto {
  @IsString()
  @MaxLength(1000)
  endpoint!: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

export class PushUnsubscribeDto {
  @IsString()
  @MaxLength(1000)
  endpoint!: string;
}

/** A customer's device belongs to the customer; any other role is an admin_users account. */
function ownerOf(user: JwtPayload): PushOwner {
  return user.role === 'CUSTOMER'
    ? { customerId: user.sub }
    : { adminUserId: user.sub };
}

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  /**
   * Public on purpose: the browser needs this key to subscribe, and a VAPID public key is public
   * by definition. Null means push is switched off on the server.
   */
  @Get('public-key')
  publicKey(): { publicKey: string | null } {
    return { publicKey: this.push.vapidPublicKey };
  }

  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async subscribe(
    @Body() dto: PushSubscriptionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    // See PUSH_SERVICE_HOSTS: the server POSTs to this URL on every notification, so only real
    // push services are accepted.
    if (!isPushServiceEndpoint(dto.endpoint)) {
      throw new BadRequestException(
        'That is not a recognised push service endpoint',
      );
    }
    await this.push.subscribe(ownerOf(user), dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('unsubscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(
    @Body() dto: PushUnsubscribeDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.push.unsubscribe(dto.endpoint, ownerOf(user));
  }
}
