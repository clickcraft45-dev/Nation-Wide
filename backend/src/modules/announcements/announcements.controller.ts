import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type {
  AnnouncementDto,
  AnnouncementKind,
} from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AnnouncementsService } from './announcements.service';

const KINDS: AnnouncementKind[] = ['EVENT', 'OFFER'];

class SaveAnnouncementBody {
  @IsIn(KINDS)
  kind!: AnnouncementKind;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9-]*$/, {
    message: 'link may only contain lower-case letters, digits and -',
  })
  slug?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(280)
  summary!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  body?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string | null;

  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_-]*$/, {
    message: 'coupon code may only contain letters, digits, - and _',
  })
  couponCode?: string | null;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsBoolean()
  showBanner?: boolean;
}

class SetFlagsBody {
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsBoolean()
  showBanner?: boolean;
}

function checkDates(body: SaveAnnouncementBody): SaveAnnouncementBody {
  if (
    body.startsAt &&
    body.endsAt &&
    new Date(body.endsAt) < new Date(body.startsAt)
  ) {
    throw new BadRequestException('The end date is before the start date.');
  }
  return body;
}

// Public and identical for every visitor, so shared caches may hold it. Five minutes is how long
// a toggle in the admin can take to reach the site.
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Header('Cache-Control', 'public, max-age=300')
  @Get()
  published(@Query('kind') kind?: string): Promise<AnnouncementDto[]> {
    const k = (kind ?? 'EVENT').toUpperCase() as AnnouncementKind;
    if (!KINDS.includes(k)) throw new BadRequestException('Unknown kind');
    return this.announcements.published(k);
  }

  // Wrapped in an object: an empty body for "no banner" breaks res.json() on the caller.
  @Header('Cache-Control', 'public, max-age=300')
  @Get('banner')
  async banner(): Promise<{ banner: AnnouncementDto | null }> {
    return { banner: await this.announcements.banner() };
  }

  @Header('Cache-Control', 'public, max-age=300')
  @Get(':slug')
  bySlug(@Param('slug') slug: string): Promise<AnnouncementDto> {
    return this.announcements.bySlug(slug);
  }
}

// ADMIN-only, the same bar as coupons: an offer is a public promise of money off.
@Controller('admin/announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list(): Promise<AnnouncementDto[]> {
    return this.announcements.list();
  }

  @Post()
  create(@Body() body: SaveAnnouncementBody): Promise<AnnouncementDto> {
    return this.announcements.create(checkDates(body));
  }

  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SaveAnnouncementBody,
  ): Promise<AnnouncementDto> {
    return this.announcements.update(id, checkDates(body));
  }

  @Patch(':id/flags')
  setFlags(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetFlagsBody,
  ): Promise<AnnouncementDto> {
    return this.announcements.setFlags(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.announcements.remove(id);
  }
}
