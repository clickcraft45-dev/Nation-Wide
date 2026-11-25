import { FuelSurchargeService } from './fuel-surcharge.service';

const CW48 = new Date('2026-11-25T06:30:00Z');
const PAGE =
  '<tr><td>CW 49</td><td>48.00%</td></tr><tr><td>CW 48</td><td>49.25 %</td></tr>';

describe('FuelSurchargeService.autoApply', () => {
  let prisma: {
    rateProvider: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    fuelSurchargeUpdate: {
      create: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    auditLog: { create: jest.Mock };
  };
  let service: FuelSurchargeService;
  let fetchMock: jest.Mock;

  const provider = (code: string, fuelChargePercent: number) => ({
    id: `p-${code}`,
    code,
    name: code,
    isActive: true,
    fuelChargePercent,
  });

  beforeEach(() => {
    prisma = {
      rateProvider: {
        findMany: jest.fn(),
        findUnique: jest.fn(({ where }) =>
          prisma.rateProvider.findMany.mock.results[0].value.then(
            (all: { id: string }[]) => all.find((p) => p.id === where.id),
          ),
        ),
        update: jest.fn(),
      },
      fuelSurchargeUpdate: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    service = new FuelSurchargeService(prisma as never);
    fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => Promise.resolve(PAGE) });
    global.fetch = fetchMock as never;
  });

  it("applies this week's DHL figure to DHL and DHL Express, reading the page once", async () => {
    prisma.rateProvider.findMany.mockResolvedValue([
      provider('DHL', 50),
      provider('DHL_EXPRESS', 50),
      provider('FEDEX', 40),
    ]);

    const results = await service.autoApply(CW48);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.map((r) => [r.code, r.outcome, r.percent])).toEqual([
      ['DHL', 'APPLIED', 49.25],
      ['DHL_EXPRESS', 'APPLIED', 49.25],
    ]);
    expect(prisma.rateProvider.update).toHaveBeenCalledWith({
      where: { id: 'p-DHL' },
      data: { fuelChargePercent: 49.25 },
    });
    expect(prisma.fuelSurchargeUpdate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: 'CARRIER_SITE',
        label: 'CW 48',
        appliedByAdminId: null,
      }),
    });
    // No person to attribute it to: the history row is the record.
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('leaves an unchanged figure alone', async () => {
    prisma.rateProvider.findMany.mockResolvedValue([provider('DHL', 49.25)]);
    const [result] = await service.autoApply(CW48);
    expect(result.outcome).toBe('UNCHANGED');
    expect(prisma.rateProvider.update).not.toHaveBeenCalled();
  });

  it('holds a jump too large to be a weekly move', async () => {
    prisma.rateProvider.findMany.mockResolvedValue([provider('DHL', 30)]);
    const [result] = await service.autoApply(CW48);
    expect(result.outcome).toBe('HELD');
    expect(prisma.rateProvider.update).not.toHaveBeenCalled();
  });

  it('reports a page it cannot reach without changing anything', async () => {
    prisma.rateProvider.findMany.mockResolvedValue([provider('DHL', 49)]);
    fetchMock.mockRejectedValue(new Error('timeout'));
    const [result] = await service.autoApply(CW48);
    expect(result.outcome).toBe('FAILED');
    expect(prisma.rateProvider.update).not.toHaveBeenCalled();
  });

  it('records the admin who opened the page against the change', async () => {
    prisma.rateProvider.findMany.mockResolvedValue([provider('DHL', 50)]);
    const results = await service.autoApply(CW48, 'admin-7');
    expect(results[0]).toMatchObject({
      outcome: 'APPLIED',
      percent: 49.25,
      previousPercent: 50,
      label: 'CW 48',
    });
    expect(prisma.fuelSurchargeUpdate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ appliedByAdminId: 'admin-7' }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'admin-7',
        action: 'FUEL_SURCHARGE_UPDATED',
      }),
    });
  });

  it('reads the carrier page once for admins reopening within ten minutes', async () => {
    prisma.rateProvider.findMany.mockResolvedValue([provider('DHL', 49.25)]);
    await service.autoApply(CW48);
    await service.autoApply(CW48);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tries the carrier again after a failed read', async () => {
    prisma.rateProvider.findMany.mockResolvedValue([provider('DHL', 49.25)]);
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    await service.autoApply(CW48);
    await new Promise((r) => setImmediate(r));
    const [result] = await service.autoApply(CW48);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe('UNCHANGED');
  });
});
