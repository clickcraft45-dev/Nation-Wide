import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CouponsService } from './coupons.service';

const baseCoupon = {
  id: 'coupon-1',
  code: 'SAVE500',
  discountAmount: 500,
  isActive: true,
  expiresAt: null as Date | null,
  maxRedemptions: null as number | null,
  timesUsed: 0,
};

describe('CouponsService', () => {
  let prisma: {
    coupon: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    pickupRequest: { count: jest.Mock };
    order: { count: jest.Mock };
  };
  let service: CouponsService;

  beforeEach(() => {
    prisma = {
      coupon: {
        findUnique: jest.fn().mockResolvedValue(baseCoupon),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue(baseCoupon),
        delete: jest.fn().mockResolvedValue(baseCoupon),
      },
      pickupRequest: { count: jest.fn().mockResolvedValue(0) },
      order: { count: jest.fn().mockResolvedValue(0) },
    };
    service = new CouponsService(prisma as never);
  });

  it('looks the code up upper-cased and trimmed — it gets read out over the phone', async () => {
    await service.validate('  save500 ');

    expect(prisma.coupon.findUnique).toHaveBeenCalledWith({
      where: { code: 'SAVE500' },
    });
  });

  it('refuses an unknown code', async () => {
    prisma.coupon.findUnique.mockResolvedValue(null);

    await expect(service.validate('NOPE')).rejects.toThrow(NotFoundException);
  });

  it('refuses a deactivated code', async () => {
    prisma.coupon.findUnique.mockResolvedValue({
      ...baseCoupon,
      isActive: false,
    });

    await expect(service.validate('SAVE500')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses an expired code', async () => {
    prisma.coupon.findUnique.mockResolvedValue({
      ...baseCoupon,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.validate('SAVE500')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses a code that has been fully redeemed', async () => {
    prisma.coupon.findUnique.mockResolvedValue({
      ...baseCoupon,
      maxRedemptions: 2,
      timesUsed: 2,
    });

    await expect(service.redeem('SAVE500')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.coupon.updateMany).not.toHaveBeenCalled();
  });

  it('claims a limited code with the limit in the WHERE clause, not in a read-then-write', async () => {
    prisma.coupon.findUnique.mockResolvedValue({
      ...baseCoupon,
      maxRedemptions: 3,
      timesUsed: 1,
    });

    await service.redeem('SAVE500');

    expect(prisma.coupon.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'coupon-1',
        isActive: true,
        deletedAt: null,
        timesUsed: { lt: 3 },
      },
      data: { timesUsed: { increment: 1 } },
    });
  });

  it('rejects the loser of two concurrent claims on the last redemption', async () => {
    prisma.coupon.findUnique.mockResolvedValue({
      ...baseCoupon,
      maxRedemptions: 1,
      timesUsed: 0,
    });
    // The other request already took it between our read and our write.
    prisma.coupon.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.redeem('SAVE500')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses a deleted code as if it never existed', async () => {
    prisma.coupon.findUnique.mockResolvedValue({
      ...baseCoupon,
      deletedAt: new Date(),
    });

    await expect(service.validate('SAVE500')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('deletes a code nobody used outright', async () => {
    await expect(service.remove('coupon-1')).resolves.toEqual({
      hidden: false,
    });
    expect(prisma.coupon.delete).toHaveBeenCalledWith({
      where: { id: 'coupon-1' },
    });
  });

  it('hides a used code instead, so the bookings it discounted keep it', async () => {
    prisma.pickupRequest.count.mockResolvedValue(2);

    await expect(service.remove('coupon-1')).resolves.toEqual({
      hidden: true,
    });
    expect(prisma.coupon.delete).not.toHaveBeenCalled();
    expect(prisma.coupon.update).toHaveBeenCalledWith({
      where: { id: 'coupon-1' },
      data: { deletedAt: expect.any(Date) as Date, isActive: false },
    });
  });

  it('checks a code against a price without claiming it, never more than the price', async () => {
    await expect(service.check('save500', 300)).resolves.toEqual({
      code: 'SAVE500',
      discountAmount: 300,
    });
    // Priced at pickup: the whole amount, capped later against the weighed price.
    await expect(service.check('save500', 0)).resolves.toEqual({
      code: 'SAVE500',
      discountAmount: 500,
    });
    expect(prisma.coupon.updateMany).not.toHaveBeenCalled();
  });
});
