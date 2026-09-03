import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

// Global, like PrismaModule/RedisModule: file storage is a cross-cutting dependency used by
// invoices, company branding and rate-card documents alike.
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
