import {
  BadGatewayException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { MailService } from './mail.service';
import { manualMessage } from './mail.templates';

export class SendManualEmailDto {
  @IsEmail()
  to!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  body!: string;

  @IsOptional()
  @IsEmail()
  replyTo?: string;
}

// A send is irreversible and goes out under the company's domain, so this is rate-limited even
// though the caller is already an authenticated admin: 20 per minute is far above real use and
// well below what a compromised session could do to the sending reputation.
const MANUAL_MAIL_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

/**
 * One-off email composed by an admin — a reply to an enquiry, a note to a customer, a nudge to a
 * partner. Rendered into the same branded shell as every other transactional message so a manual
 * note is not visually distinguishable from an automated one.
 */
@Controller('admin/mail')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class AdminMailController {
  private readonly logger = new Logger(AdminMailController.name);

  constructor(private readonly mail: MailService) {}

  @Throttle(MANUAL_MAIL_THROTTLE)
  @Post('send')
  @HttpCode(HttpStatus.OK)
  async send(
    @Body() dto: SendManualEmailDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ message: string }> {
    const sent = await this.mail.send(
      manualMessage(dto.to, dto.subject, dto.body, dto.replyTo),
    );

    // Unlike the fire-and-forget alerts, the admin is watching this one — reporting success for
    // a message that never left would be a lie they act on.
    if (!sent) {
      throw new BadGatewayException(
        'The email could not be sent. Check the mail provider configuration and try again.',
      );
    }

    // Who sent what to whom, for the audit trail. Never the body.
    this.logger.log(
      `Manual email sent by ${user.sub} to ${dto.to} — "${dto.subject}"`,
    );
    return { message: `Email sent to ${dto.to}.` };
  }
}
