import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface ShippingProviderSummary {
  id: string;
  code: string;
  name: string;
}

@Injectable()
export class ShippingProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<ShippingProviderSummary[]> {
    return this.prisma.shippingProvider.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
