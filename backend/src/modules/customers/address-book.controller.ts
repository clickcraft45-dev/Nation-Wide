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
import type { AddressBookDto, SavedItemDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { AddressBookService } from './address-book.service';
import { SaveItemDto } from './dto/save-item.dto';

// Two audiences, same data: a customer's own address book (ownership from the JWT, never a
// client-supplied id), and staff reading/editing any customer's while booking for them. The "me"
// routes are registered first so "me" is never taken as a customer id.
@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AddressBookController {
  constructor(private readonly addressBook: AddressBookService) {}

  @Get('me/address-book')
  @Roles('CUSTOMER')
  getMine(@CurrentUser() user: JwtPayload): Promise<AddressBookDto> {
    return this.addressBook.get(user.sub);
  }

  @Post('me/saved-items')
  @Roles('CUSTOMER')
  createMine(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SaveItemDto,
  ): Promise<SavedItemDto> {
    return this.addressBook.create(user.sub, dto);
  }

  @Patch('me/saved-items/:itemId')
  @Roles('CUSTOMER')
  updateMine(
    @CurrentUser() user: JwtPayload,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: SaveItemDto,
  ): Promise<SavedItemDto> {
    return this.addressBook.update(user.sub, itemId, dto);
  }

  @Delete('me/saved-items/:itemId')
  @Roles('CUSTOMER')
  @HttpCode(204)
  removeMine(
    @CurrentUser() user: JwtPayload,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    return this.addressBook.remove(user.sub, itemId);
  }

  @Get(':id/address-book')
  @Roles('STAFF', 'ADMIN')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AddressBookDto> {
    return this.addressBook.get(id);
  }

  @Post(':id/saved-items')
  @Roles('STAFF', 'ADMIN')
  create(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveItemDto,
  ): Promise<SavedItemDto> {
    return this.addressBook.create(id, dto);
  }

  @Patch(':id/saved-items/:itemId')
  @Roles('STAFF', 'ADMIN')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: SaveItemDto,
  ): Promise<SavedItemDto> {
    return this.addressBook.update(id, itemId, dto);
  }

  @Delete(':id/saved-items/:itemId')
  @Roles('STAFF', 'ADMIN')
  @HttpCode(204)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    return this.addressBook.remove(id, itemId);
  }
}
