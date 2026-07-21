import { Injectable } from '@nestjs/common';
import { Prisma, type Shipment } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { generateInternalTrackingNumber } from './tracking-number';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const MAX_GENERATION_ATTEMPTS = 5;

@Injectable()
export class ShipmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForOrder(orderId: string, providerId: string): Promise<Shipment> {
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.shipment.create({
          data: {
            orderId,
            providerId,
            internalTrackingNumber: generateInternalTrackingNumber(),
          },
        });
      } catch (error) {
        const isTrackingNumberCollision =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === UNIQUE_CONSTRAINT_VIOLATION &&
          (error.meta?.target as string[] | undefined)?.includes(
            'internal_tracking_number',
          );

        if (!isTrackingNumberCollision) {
          throw error;
        }
        // Astronomically unlikely (40 bits of randomness) but cheap to guard against — retry
        // with a freshly generated number rather than surfacing a confusing 500 to staff.
      }
    }

    throw new Error(
      `Failed to generate a unique internal tracking number after ${MAX_GENERATION_ATTEMPTS} attempts`,
    );
  }
}
