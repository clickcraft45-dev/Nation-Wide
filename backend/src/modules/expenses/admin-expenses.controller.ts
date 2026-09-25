import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import type { ExpenseDto, ExpenseListDto } from '@nationwide/shared-types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { ExpensesService } from './expenses.service';
import { toExpenseDto } from './expense.mapper';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { ReceiptUpload, requireReceipt } from './receipt-upload';

// ADMIN only, matching GST Invoices: what the company spends is not operational data, and the
// Accounts that only work orders have no reason to see payroll or rent.
@Controller('admin/expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  async list(@Query() query: QueryExpensesDto): Promise<ExpenseListDto> {
    const { items, ...totals } = await this.expenses.list(query);
    return { items: items.map(toExpenseDto), ...totals };
  }

  @Post()
  async create(
    @Body() dto: CreateExpenseDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ExpenseDto> {
    return toExpenseDto(await this.expenses.create(dto, user.sub));
  }

  // A typo in an amount is the common case; an expense carries no statutory number, so unlike an
  // invoice it can simply be corrected.
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: CreateExpenseDto,
  ): Promise<ExpenseDto> {
    return toExpenseDto(await this.expenses.update(id, dto));
  }

  // The vendor's own bill. Separate from create/update because it is a multipart upload, and
  // because a receipt usually turns up after the expense has already been recorded.
  @Post(':id/receipt')
  @ReceiptUpload()
  async uploadReceipt(
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ExpenseDto> {
    return toExpenseDto(
      await this.expenses.attachReceipt(id, requireReceipt(file)),
    );
  }

  // A short-lived signed URL rather than proxying the bytes: the bucket blocks public access, so
  // this is the only way the browser can open the file, and the link expires in five minutes.
  @Get(':id/receipt')
  async receiptUrl(@Param('id') id: string): Promise<{ url: string }> {
    return { url: await this.expenses.receiptUrl(id) };
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.expenses.remove(id);
  }
}
