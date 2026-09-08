import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { ReviewsService } from './reviews.service';

export class SetApprovedDto {
  @IsBoolean()
  approved!: boolean;
}

/** Moderation. Nothing a customer writes reaches the homepage until it passes through here. */
@Controller('admin/reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STAFF', 'ADMIN')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  findAll() {
    return this.reviews.submitted();
  }

  @Patch(':id/approval')
  setApproved(
    @Param('id') id: string,
    @Body() dto: SetApprovedDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.reviews.setApproved(id, dto.approved, user.sub);
  }
}
