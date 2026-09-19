import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional } from 'class-validator';
import type { B2bRequest, PartnerApplicationStatus } from '@prisma/client';
import type {
  B2bRequestDto,
  B2bRequestApprovalDto,
} from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { B2bRequestsService } from './b2b-requests.service';
import { CreateB2bRequestDto } from './dto/create-b2b-request.dto';
import { ReviewB2bRequestDto } from './dto/review-b2b-request.dto';

// Unauthenticated and therefore tight: this writes a row and sends an email, and guessing is not
// required to reach it.
const SUBMIT_THROTTLE = { default: { limit: 3, ttl: 60_000 } };

function toDto(request: B2bRequest): B2bRequestDto {
  return {
    id: request.id,
    companyName: request.companyName,
    contactName: request.contactName,
    email: request.email,
    phone: request.phone,
    monthlyVolume: request.monthlyVolume,
    message: request.message,
    status: request.status,
    reviewNote: request.reviewNote,
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    createdCustomerId: request.createdCustomerId,
    createdAt: request.createdAt.toISOString(),
  };
}

class QueryB2bRequestsDto {
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED'])
  status?: PartnerApplicationStatus;
}

/** The public "work with us" form on the marketing site. No account, no token — just a request. */
@Controller('b2b-requests')
export class PublicB2bRequestsController {
  constructor(private readonly requests: B2bRequestsService) {}

  @Throttle(SUBMIT_THROTTLE)
  @Post()
  async create(@Body() dto: CreateB2bRequestDto): Promise<{ message: string }> {
    await this.requests.create(dto);
    // Nothing about the request is echoed back: this endpoint is public, and a response that
    // varied by what we already know would leak which businesses are already customers.
    return {
      message:
        'Thanks — our team will get in touch to set up your business account.',
    };
  }
}

// Approving mints a customer and a link that can place orders billed to them, so ADMIN only —
// the same bar as issuing a link by hand.
@Controller('admin/b2b-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminB2bRequestsController {
  constructor(private readonly requests: B2bRequestsService) {}

  @Get()
  async findAll(@Query() query: QueryB2bRequestsDto): Promise<B2bRequestDto[]> {
    const requests = await this.requests.findAll(query.status);
    return requests.map(toDto);
  }

  /** The response carries the only sight of the new link's URL. */
  @Patch(':id/approve')
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewB2bRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<B2bRequestApprovalDto> {
    const { request, link } = await this.requests.approve(id, dto, user.sub);
    return { request: toDto(request), link };
  }

  @Patch(':id/reject')
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewB2bRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<B2bRequestDto> {
    return toDto(await this.requests.reject(id, dto, user.sub));
  }
}
