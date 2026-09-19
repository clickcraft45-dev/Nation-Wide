import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { AddressBookController } from './address-book.controller';
import { AddressBookService } from './address-book.service';

@Module({
  controllers: [AddressBookController, CustomersController],
  providers: [CustomersService, AddressBookService],
  exports: [CustomersService, AddressBookService],
})
export class CustomersModule {}
