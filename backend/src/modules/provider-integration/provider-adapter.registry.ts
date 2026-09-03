import { Injectable } from '@nestjs/common';
import type { ShippingProvider } from './interfaces/shipping-provider.interface';
import { StubShippingProviderAdapter } from './adapters/stub/stub-shipping-provider.adapter';
import { ICLShippingProviderAdapter } from './adapters/icl/icl-shipping-provider.adapter';

/**
 * Resolves a shipping_providers.adapter_class value to the concrete adapter instance that
 * implements it. Adding DHL/FedEx/UPS later means adding a new adapter class and registering
 * it here — the Tracking module, database schema, and frontend never change (Section 11).
 */
@Injectable()
export class ProviderAdapterRegistry {
  private readonly adaptersByClassName = new Map<string, ShippingProvider>();

  constructor(
    stubAdapter: StubShippingProviderAdapter,
    iclAdapter: ICLShippingProviderAdapter,
  ) {
    this.adaptersByClassName.set('StubShippingProviderAdapter', stubAdapter);
    this.adaptersByClassName.set('ICLShippingProviderAdapter', iclAdapter);
  }

  resolve(adapterClass: string): ShippingProvider {
    const adapter = this.adaptersByClassName.get(adapterClass);
    if (!adapter) {
      throw new Error(
        `No adapter registered for adapterClass "${adapterClass}"`,
      );
    }
    return adapter;
  }
}
