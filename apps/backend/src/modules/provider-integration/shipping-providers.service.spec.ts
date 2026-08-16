import { ShippingProvidersService } from './shipping-providers.service';

describe('ShippingProvidersService', () => {
  it('selects only id/code/name, ordered by name', async () => {
    const prisma = {
      shippingProvider: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ShippingProvidersService(prisma as never);

    await service.findAll();

    expect(prisma.shippingProvider.findMany).toHaveBeenCalledWith({
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
  });
});
