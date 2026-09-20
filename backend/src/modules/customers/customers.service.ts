import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  resolvePagination,
  type PaginationParams,
} from '../../common/utils/pagination.util';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const RECORD_NOT_FOUND = 'P2025';

// Deliberately excludes passwordHash / hashedRefreshToken — those must never leave this
// service, not even to ADMIN/ADMIN callers. Keep in sync with @nationwide/shared-types CustomerDto.
const PUBLIC_CUSTOMER_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  address: true,
  isB2b: true,
  isActive: true,
  consentGivenAt: true,
  consentSource: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerSelect;

export type PublicCustomer = Prisma.CustomerGetPayload<{
  select: typeof PUBLIC_CUSTOMER_SELECT;
}>;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCustomerDto): Promise<PublicCustomer> {
    try {
      return await this.prisma.customer.create({
        data: {
          name: dto.name,
          phone: dto.phone,
          email: dto.email,
          address: dto.address,
          consentSource: dto.consentSource,
          consentGivenAt: new Date(),
        },
        select: PUBLIC_CUSTOMER_SELECT,
      });
    } catch (error) {
      this.rethrowKnownPrismaError(error, dto.phone);
      throw error;
    }
  }

  // total is only computed (an extra COUNT query) when pagination was actually requested —
  // every existing caller that omits page/pageSize (dashboard, reports, payments aggregation,
  // the admin quote wizard's customer search) keeps getting the full array with zero extra
  // query cost and no response-shape change.
  async findAll(
    params: PaginationParams & { search?: string } = {},
  ): Promise<{ data: PublicCustomer[]; total: number | null }> {
    const where: Prisma.CustomerWhereInput = params.search
      ? {
          OR: [
            { name: { contains: params.search, mode: 'insensitive' } },
            { email: { contains: params.search, mode: 'insensitive' } },
            { phone: { contains: params.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const paging = resolvePagination(params);
    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: PUBLIC_CUSTOMER_SELECT,
        ...paging,
      }),
      paging ? this.prisma.customer.count({ where }) : Promise.resolve(null),
    ]);
    return { data, total };
  }

  async findOne(id: string): Promise<PublicCustomer> {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: PUBLIC_CUSTOMER_SELECT,
    });
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    return customer;
  }

  /**
   * Delete a customer outright. Only possible while nothing references them: an order, quote,
   * invoice or receipt makes them part of a statutory record that must not vanish, and Postgres
   * refuses the delete (P2003). Deactivation is the answer there — it blocks sign-in and takes
   * them out of the booking screens while the history stays intact.
   */
  async remove(id: string, actorId: string): Promise<void> {
    const customer = await this.findOne(id);
    try {
      await this.prisma.customer.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'This customer has orders or documents recorded against them and cannot be deleted. Deactivate them instead — that blocks sign-in and hides them from booking, while keeping their history.',
        );
      }
      throw error;
    }
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'CUSTOMER_DELETED',
        entity: 'Customer',
        entityId: id,
        before: { name: customer.name, phone: customer.phone },
        after: {},
      },
    });
  }

  /** Deactivating ends the session too: a live refresh token would outlast the block otherwise. */
  async setActive(
    id: string,
    isActive: boolean,
    actorId: string,
  ): Promise<PublicCustomer> {
    const existing = await this.findOne(id);
    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        isActive,
        ...(isActive ? {} : { hashedRefreshToken: null }),
      },
      select: PUBLIC_CUSTOMER_SELECT,
    });
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: isActive ? 'CUSTOMER_REACTIVATED' : 'CUSTOMER_DEACTIVATED',
        entity: 'Customer',
        entityId: id,
        before: { isActive: existing.isActive },
        after: { isActive },
      },
    });
    return updated;
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<PublicCustomer> {
    try {
      return await this.prisma.customer.update({
        where: { id },
        data: dto,
        select: PUBLIC_CUSTOMER_SELECT,
      });
    } catch (error) {
      this.rethrowKnownPrismaError(error, dto.phone, id);
      throw error;
    }
  }

  private rethrowKnownPrismaError(
    error: unknown,
    phone?: string,
    id?: string,
  ): void {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return;
    }
    if (error.code === UNIQUE_CONSTRAINT_VIOLATION) {
      throw new ConflictException(
        phone
          ? `A customer with phone ${phone} already exists`
          : 'Duplicate value',
      );
    }
    if (error.code === RECORD_NOT_FOUND) {
      throw new NotFoundException(
        id ? `Customer ${id} not found` : 'Customer not found',
      );
    }
  }
}
