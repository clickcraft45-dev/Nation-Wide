import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';
import type {
  ItemCatalogEntryDto,
  UnlistedItemDto,
} from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ItemCatalogService, toCatalogDto } from './item-catalog.service';

class SaveItemCatalogEntryBody {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  hsCode?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10_000_000)
  defaultUnitValue?: number;
}

/**
 * The list, for every screen where contents are typed: the customer's booking, the B2B portal
 * (which signs in with a link token, not a staff login), staff booking and the partner at the
 * door. Item names and HS codes are neither personal nor secret, so reading it is open.
 */
@Controller('item-catalog')
export class ItemCatalogController {
  constructor(private readonly catalog: ItemCatalogService) {}

  @Get()
  async list(): Promise<ItemCatalogEntryDto[]> {
    return (await this.catalog.list()).map(toCatalogDto);
  }
}

/** Keeping the list: the admin's "Items" page. */
@Controller('admin/item-catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminItemCatalogController {
  constructor(private readonly catalog: ItemCatalogService) {}

  // Ahead of the :id routes.
  @Get('unlisted')
  unlisted(): Promise<UnlistedItemDto[]> {
    return this.catalog.unlisted();
  }

  @Post()
  async create(
    @Body() body: SaveItemCatalogEntryBody,
  ): Promise<ItemCatalogEntryDto> {
    return toCatalogDto(await this.catalog.create(body));
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SaveItemCatalogEntryBody,
  ): Promise<ItemCatalogEntryDto> {
    return toCatalogDto(await this.catalog.update(id, body));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.catalog.remove(id);
  }
}
