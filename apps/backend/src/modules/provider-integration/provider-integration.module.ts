import { Module } from '@nestjs/common';
import { StubShippingProviderAdapter } from './adapters/stub/stub-shipping-provider.adapter';
import { ProviderAdapterRegistry } from './provider-adapter.registry';

@Module({
  providers: [StubShippingProviderAdapter, ProviderAdapterRegistry],
  exports: [ProviderAdapterRegistry],
})
export class ProviderIntegrationModule {}
