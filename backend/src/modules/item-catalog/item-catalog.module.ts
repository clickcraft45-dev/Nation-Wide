import { Module } from '@nestjs/common';
import { ItemCatalogService } from './item-catalog.service';
import {
  AdminItemCatalogController,
  ItemCatalogController,
} from './item-catalog.controller';

@Module({
  controllers: [ItemCatalogController, AdminItemCatalogController],
  providers: [ItemCatalogService],
})
export class ItemCatalogModule {}
