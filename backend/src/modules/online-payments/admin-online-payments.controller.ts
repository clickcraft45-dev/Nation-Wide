import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AdminOnlinePaymentDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { OnlinePaymentsService } from './online-payments.service';
import { toAdminOnlinePaymentDto } from './online-payment.mapper';
import { RejectOnlinePaymentDto } from './dto/reject-online-payment.dto';

/**
 * The office's side of an online payment: the gateway reports that money moved, and an admin who
 * has looked at the bank account says whether it did.
 */
@Controller('admin/online-payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminOnlinePaymentsController {
  constructor(private readonly onlinePayments: OnlinePaymentsService) {}

  /** `?scope=all` for the whole ledger; the default is only what is waiting for a decision. */
  @Get()
  async list(@Query('scope') scope?: string): Promise<AdminOnlinePaymentDto[]> {
    const payments = await this.onlinePayments.listForAdmin(
      scope === 'all' ? 'all' : 'review',
    );
    return payments.map(toAdminOnlinePaymentDto);
  }

  @Post(':id/confirm')
  async confirm(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdminOnlinePaymentDto> {
    return toAdminOnlinePaymentDto(
      await this.onlinePayments.confirm(id, user.sub),
    );
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectOnlinePaymentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdminOnlinePaymentDto> {
    return toAdminOnlinePaymentDto(
      await this.onlinePayments.reject(id, dto.note, user.sub),
    );
  }
}
