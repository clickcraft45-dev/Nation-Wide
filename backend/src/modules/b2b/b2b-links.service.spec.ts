import { createHash } from 'node:crypto';
import { B2bLinksService } from './b2b-links.service';

describe('B2bLinksService', () => {
  let prisma: {
    customer: { findUnique: jest.Mock };
    b2bLink: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    auditLog: { create: jest.Mock };
  };
  let service: B2bLinksService;

  const LINK = {
    id: 'link-1',
    customerId: 'customer-1',
    label: 'Bengaluru warehouse',
    tokenHash: 'hash',
    createdByAdminId: 'admin-1',
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date('2026-09-18T00:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({ id: 'customer-1' }),
      },
      b2bLink: {
        create: jest.fn().mockResolvedValue(LINK),
        findMany: jest.fn().mockResolvedValue([LINK]),
        findUnique: jest.fn().mockResolvedValue(LINK),
        update: jest.fn().mockResolvedValue(LINK),
      },
      auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    };
    service = new B2bLinksService(
      prisma as never,
      {
        get: () => 'https://nationwide.example',
      } as never,
    );
  });

  it('stores only a hash of the token and hands back the link once', async () => {
    const result = await service.create(
      'customer-1',
      '  Bengaluru  ',
      'admin-1',
    );

    const { data } = (
      prisma.b2bLink.create.mock.calls[0] as [{ data: Record<string, string> }]
    )[0];
    const token = result.url!.split('/b2b/')[1];
    expect(token).toHaveLength(43); // 32 random bytes, base64url
    expect(data.tokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    // The token itself is never written anywhere.
    expect(JSON.stringify(data)).not.toContain(token);
    expect(data.label).toBe('Bengaluru');
  });

  it('records who holds the link, and null rather than an empty name', async () => {
    await service.create('customer-1', 'Bengaluru', 'admin-1', '  Priya  ');
    await service.create('customer-1', 'Bengaluru', 'admin-1', '   ');

    const calls = prisma.b2bLink.create.mock.calls as [
      { data: Record<string, string | null> },
    ][];
    expect(calls[0][0].data.contactName).toBe('Priya');
    // A blank box must not become an empty-string "contact" the manager then displays.
    expect(calls[1][0].data.contactName).toBeNull();
  });

  it('resolves a live token to its customer and records the use', async () => {
    const session = await service.resolve('some-token');

    expect(prisma.b2bLink.findUnique).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256').update('some-token').digest('hex'),
      },
    });
    expect(session).toEqual({
      linkId: 'link-1',
      customerId: 'customer-1',
      label: 'Bengaluru warehouse',
    });
    expect(prisma.b2bLink.update).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it('refuses a revoked, unknown or missing token', async () => {
    prisma.b2bLink.findUnique.mockResolvedValue({
      ...LINK,
      revokedAt: new Date(),
    });
    await expect(service.resolve('some-token')).resolves.toBeNull();

    prisma.b2bLink.findUnique.mockResolvedValue(null);
    await expect(service.resolve('some-token')).resolves.toBeNull();
    await expect(service.resolve(undefined)).resolves.toBeNull();
  });
});
