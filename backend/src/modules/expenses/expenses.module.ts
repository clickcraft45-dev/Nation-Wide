import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { AdminExpensesController } from './admin-expenses.controller';

@Module({
  controllers: [AdminExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
