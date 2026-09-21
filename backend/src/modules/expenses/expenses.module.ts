import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { AdminExpensesController } from './admin-expenses.controller';
import { ExpenseCategoriesService } from './expense-categories.service';
import { ExpenseCategoriesController } from './expense-categories.controller';

@Module({
  controllers: [AdminExpensesController, ExpenseCategoriesController],
  providers: [ExpensesService, ExpenseCategoriesService],
})
export class ExpensesModule {}
