import { ConflictException } from '@nestjs/common';
import { B2bRequestsService } from './b2b-requests.service';

const REQUEST = {
  id: 'req-1',
  companyName: 'Kirana Exports',
  contactName: 'Asha',
  email: 'asha@kirana.example',
  phone: '+919876500099',
  monthlyVolume: '40-60 parcels',
  message: null,
  status: 'PENDING',
  reviewedByAdminId: null,
  reviewedAt: null,
  reviewNote: null,
  createdCustomerId: null,
  createdB2bLinkId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('B2bRequestsService', () => {
  let prisma: {
    b2bRequest: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    customer: { findFirst: jest.Mock };
  };
  let customers: { create: jest.Mock };
  let links: { create: jest.Mock };
  let mail: { send: jest.Mock; operationsInbox: string };
  let service: B2bRequestsService;

  beforeEach(() => {
    prisma = {
      b2bRequest: {
        create: jest.fn().mockResolvedValue(REQUEST),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([REQUEST]),
        findUnique: jest.fn().mockResolvedValue(REQUEST),
        update: jest.fn().mockResolvedValue({ ...REQUEST, status: 'APPROVED' }),
      },
      customer: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    customers = { create: jest.fn().mockResolvedValue({ id: 'customer-new' }) };
    links = {
      create: jest.fn().mockResolvedValue({
        id: 'link-1',
        url: 'https://nw.example/b2b/tok',
      }),
    };
    mail = {
      send: jest.fn().mockResolvedValue(true),
      operationsInbox: 'ops@nw.example',
    };
    service = new B2bRequestsService(
      prisma as never,
      customers as never,
      links as never,
      mail as never,
      { get: () => 'https://nw.example' } as never,
    );
  });

  describe('create', () => {
    it('records the request and alerts the operations inbox', async () => {
      await service.create({
        companyName: '  Kirana Exports ',
        contactName: 'Asha',
        email: 'ASHA@Kirana.example',
        phone: '+919876500099',
      });

      expect(prisma.b2bRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyName: 'Kirana Exports',
          // Lower-cased, so a second request from the same address is caught as a duplicate.
          email: 'asha@kirana.example',
        }),
      });
      expect(mail.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'ops@nw.example' }),
      );
    });

    it('refuses a second request while one is still pending', async () => {
      prisma.b2bRequest.findFirst.mockResolvedValue({ id: 'req-1' });
      await expect(
        service.create({
          companyName: 'Kirana',
          contactName: 'Asha',
          email: 'asha@kirana.example',
          phone: '+919876500099',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.b2bRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('creates the customer, issues the link, and records both', async () => {
      const { link } = await service.approve('req-1', {}, 'admin-1');

      expect(customers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Kirana Exports',
          phone: '+919876500099',
          consentSource: 'b2b_request',
        }),
      );
      expect(links.create).toHaveBeenCalledWith(
        'customer-new',
        'Kirana Exports',
        'admin-1',
      );
      // The URL is handed straight back — the one and only sight of the token.
      expect(link.url).toBe('https://nw.example/b2b/tok');
      expect(prisma.b2bRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: expect.objectContaining({
          status: 'APPROVED',
          createdCustomerId: 'customer-new',
          createdB2bLinkId: 'link-1',
        }),
      });
    });

    it('reuses an existing customer rather than duplicating them', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'customer-old' });

      await service.approve('req-1', {}, 'admin-1');

      expect(customers.create).not.toHaveBeenCalled();
      expect(links.create).toHaveBeenCalledWith(
        'customer-old',
        'Kirana Exports',
        'admin-1',
      );
    });

    it('refuses to approve twice — that would issue a second link', async () => {
      prisma.b2bRequest.findUnique.mockResolvedValue({
        ...REQUEST,
        status: 'APPROVED',
      });
      await expect(service.approve('req-1', {}, 'admin-1')).rejects.toThrow(
        ConflictException,
      );
      expect(links.create).not.toHaveBeenCalled();
    });
  });
});
