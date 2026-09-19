import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { B2bLinkDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { B2bLinksService, toB2bLinkDto } from './b2b-links.service';

class CreateB2bLinkDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;
}

// Issuing a link lets its holder place orders billed to that customer, so ADMIN only — the same
// bar as company settings, not the STAFF bar used for day-to-day booking.
@Controller('admin/customers/:customerId/b2b-links')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminB2bLinksController {
  constructor(private readonly links: B2bLinksService) {}

  @Get()
  async findAll(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<B2bLinkDto[]> {
    const links = await this.links.findAllForCustomer(customerId);
    return links.map((link) => toB2bLinkDto(link));
  }

  /** The response carries the only sight of the link URL — it cannot be shown again. */
  @Post()
  create(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: CreateB2bLinkDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<B2bLinkDto> {
    return this.links.create(customerId, dto.label, user.sub);
  }

  @Patch(':id/revoke')
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<B2bLinkDto> {
    return toB2bLinkDto(await this.links.revoke(id, user.sub));
  }
}
