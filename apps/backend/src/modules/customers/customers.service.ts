import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Customer } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const RECORD_NOT_FOUND = 'P2025';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCustomerDto): Promise<Customer> {
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
      });
    } catch (error) {
      this.rethrowKnownPrismaError(error, dto.phone);
      throw error;
    }
  }

  findAll(): Promise<Customer[]> {
    return this.prisma.customer.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    try {
      return await this.prisma.customer.update({ where: { id }, data: dto });
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
