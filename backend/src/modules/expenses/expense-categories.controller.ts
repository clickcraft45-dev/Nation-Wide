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
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { ExpenseCategoryDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ExpenseCategoriesService } from './expense-categories.service';

class CreateExpenseCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  /** Omitted for a top-level category; set to nest one level under it. */
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

class RenameExpenseCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;
}

// Same bar as the expenses themselves: these headings are how payroll and rent are filed.
@Controller('admin/expense-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ExpenseCategoriesController {
  constructor(private readonly categories: ExpenseCategoriesService) {}

  @Get()
  list(): Promise<ExpenseCategoryDto[]> {
    return this.categories.list();
  }

  @Post()
  create(@Body() dto: CreateExpenseCategoryDto): Promise<ExpenseCategoryDto> {
    return this.categories.create(dto.name, dto.parentId);
  }

  @Patch(':id')
  rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameExpenseCategoryDto,
  ): Promise<ExpenseCategoryDto> {
    return this.categories.rename(id, dto.name);
  }

  /** Refused with a plain reason while anything is filed under it. */
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.categories.remove(id);
  }
}
