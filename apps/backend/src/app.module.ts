import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { HealthController } from './health.controller';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AppService } from './app.service';
import { PrismaModule } from './database/prisma.module';
import { RedisModule } from './database/redis.module';
import { validateEnv } from './common/config/env.validation';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { CustomersModule } from './modules/customers/customers.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ShipmentsModule } from './modules/shipments/shipments.module';
import { ProviderIntegrationModule } from './modules/provider-integration/provider-integration.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PickupRequestsModule } from './modules/pickup-requests/pickup-requests.module';
import { PincodesModule } from './modules/pincodes/pincodes.module';
import { InvoicesModule } from './modules/invoices/invoices.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Applied globally via APP_GUARD below — this is the lenient default (300 req/min/IP).
    // Sensitive endpoints (login/register/refresh/change-password/quote+pickup-request creation/
    // payment collection) apply a much stricter @Throttle override directly on the route to
    // blunt brute-force/credential-stuffing/spam without rate-limiting the rest of the API.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    RedisModule,
    AuthModule,
    AdminModule,
    CustomersModule,
    ShipmentsModule,
    OrdersModule,
    ProviderIntegrationModule,
    TrackingModule,
    NotificationsModule,
    PickupRequestsModule,
    PincodesModule,
    InvoicesModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
