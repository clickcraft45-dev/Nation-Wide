import { Module } from '@nestjs/common';
import { StubShippingProviderAdapter } from './adapters/stub/stub-shipping-provider.adapter';
import { ICLShippingProviderAdapter } from './adapters/icl/icl-shipping-provider.adapter';
import { ProviderAdapterRegistry } from './provider-adapter.registry';
import { ShippingProvidersController } from './shipping-providers.controller';
import { ShippingProvidersService } from './shipping-providers.service';

@Module({
  controllers: [ShippingProvidersController],
  providers: [
    StubShippingProviderAdapter,
    ICLShippingProviderAdapter,
    ProviderAdapterRegistry,
    ShippingProvidersService,
  ],
  exports: [ProviderAdapterRegistry],
})
export class ProviderIntegrationModule {}
