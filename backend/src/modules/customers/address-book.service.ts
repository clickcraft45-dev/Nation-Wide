import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AddressBookDto,
  SavedItemDto,
  ShipmentItemDto,
} from '@nationwide/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { SaveItemDto } from './dto/save-item.dto';

const RECENT_RECIPIENTS = 20;

type Db = PrismaService | Prisma.TransactionClient;

function toSavedItemDto(item: {
  id: string;
  category: string | null;
  description: string;
  hsCode: string | null;
  unitValue: number;
}): SavedItemDto {
  return {
    id: item.id,
    category: item.category,
    description: item.description,
    hsCode: item.hsCode,
    unitValue: item.unitValue,
  };
}

/**
 * What a booking form can prefill for a customer. The pickup address and the recipients are read
 * straight off their past bookings rather than kept in tables of their own: every booking already
 * records them, so "save it for next time" is simply "book it", and an overwritten address becomes
 * the new default the moment it is used. Contents are the exception — they get a real table
 * (SavedItem) because the customer edits and deletes them directly.
 */
@Injectable()
export class AddressBookService {
  constructor(private readonly prisma: PrismaService) {}

  async get(customerId: string): Promise<AddressBookDto> {
    const [lastPickup, recipients, savedItems] = await Promise.all([
      this.prisma.pickupRequest.findFirst({
        where: { customerId, dropAtWarehouse: false },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.quote.findMany({
        where: { customerId, destAddressLine1: { not: null } },
        orderBy: { updatedAt: 'desc' },
        distinct: [
          'destName',
          'destPhone',
          'destAddressLine1',
          'destPostalCode',
          'destCountry',
        ],
        take: RECENT_RECIPIENTS,
      }),
      this.prisma.savedItem.findMany({
        where: { customerId },
        orderBy: { description: 'asc' },
      }),
    ]);

    return {
      lastPickup: lastPickup
        ? {
            contactName: lastPickup.pickupContactName,
            contactPhone: lastPickup.pickupContactPhone,
            addressLine1: lastPickup.pickupAddressLine1,
            addressLine2: lastPickup.pickupAddressLine2,
            city: lastPickup.pickupCity,
            state: lastPickup.pickupState,
            postalCode: lastPickup.pickupPostalCode,
            latitude: lastPickup.pickupLatitude,
            longitude: lastPickup.pickupLongitude,
          }
        : null,
      recipients: recipients.map((q) => ({
        // What went to this address last time, so picking the name brings the goods back.
        lastItems: (q.items as ShipmentItemDto[] | null) ?? null,
        name: q.destName ?? '',
        phone: q.destPhone ?? '',
        addressLine1: q.destAddressLine1 ?? '',
        addressLine2: q.destAddressLine2,
        city: q.destCity ?? '',
        state: q.destState ?? '',
        postalCode: q.destPostalCode ?? '',
        country: q.destCountry,
      })),
      savedItems: savedItems.map(toSavedItemDto),
    };
  }

  /** Remembers what was just shipped — an existing description is updated with the new value. */
  async remember(
    customerId: string,
    items: {
      description: string;
      unitValue: number;
      hsCode?: string | null;
      category?: string | null;
    }[],
    db: Db = this.prisma,
  ): Promise<void> {
    for (const item of items) {
      const data = {
        unitValue: item.unitValue,
        hsCode: item.hsCode?.trim() || null,
        category: item.category?.trim() || null,
      };
      await db.savedItem.upsert({
        where: {
          customerId_description: {
            customerId,
            description: item.description.trim(),
          },
        },
        create: { customerId, description: item.description.trim(), ...data },
        update: data,
      });
    }
  }

  async create(customerId: string, dto: SaveItemDto): Promise<SavedItemDto> {
    try {
      await this.remember(customerId, [dto]);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new NotFoundException(`Customer ${customerId} not found`);
      }
      throw error;
    }
    const saved = await this.prisma.savedItem.findUniqueOrThrow({
      where: {
        customerId_description: {
          customerId,
          description: dto.description.trim(),
        },
      },
    });
    return toSavedItemDto(saved);
  }

  async update(
    customerId: string,
    id: string,
    dto: SaveItemDto,
  ): Promise<SavedItemDto> {
    try {
      // Scoped by customerId too, so one customer can never edit another's item by guessing an id.
      const updated = await this.prisma.savedItem.updateMany({
        where: { id, customerId },
        data: {
          description: dto.description.trim(),
          unitValue: dto.unitValue,
          hsCode: dto.hsCode?.trim() || null,
          category: dto.category?.trim() || null,
        },
      });
      if (updated.count === 0) {
        throw new NotFoundException(`Saved item ${id} not found`);
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Another saved item already has this description',
        );
      }
      throw error;
    }
    return toSavedItemDto(
      await this.prisma.savedItem.findUniqueOrThrow({ where: { id } }),
    );
  }

  async remove(customerId: string, id: string): Promise<void> {
    const deleted = await this.prisma.savedItem.deleteMany({
      where: { id, customerId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException(`Saved item ${id} not found`);
    }
  }
}
