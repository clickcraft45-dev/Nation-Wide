import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ReviewsService } from './reviews.service';

const SHIPMENT = {
  id: 'ship-1',
  internalTrackingNumber: 'NW-2026-00000042',
  order: { customer: { id: 'cust-1', name: 'Ravi Kumar', email: 'ravi@example.com' } },
};

describe('ReviewsService', () => {
  let prisma: {
    review: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    shipment: { findUnique: jest.Mock };
  };
  let mail: { send: jest.Mock };
  let service: ReviewsService;

  beforeEach(() => {
    prisma = {
      review: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'rev-1' }),
        update: jest.fn().mockResolvedValue({ id: 'rev-1' }),
      },
      shipment: { findUnique: jest.fn().mockResolvedValue(SHIPMENT) },
    };
    mail = { send: jest.fn().mockResolvedValue(true) };
    service = new ReviewsService(prisma as never, mail as never, {
      get: jest.fn().mockReturnValue('https://app.test'),
    } as never);
  });

  describe('requestFeedback', () => {
    it('stores only the hash of the token, and mails the raw one', async () => {
      await service.requestFeedback('ship-1');

      const stored = prisma.review.create.mock.calls[0][0].data;
      const link: string = mail.send.mock.calls[0][0].text;
      const token = link.match(/feedback\/([\w-]+)/)?.[1];

      expect(token).toBeTruthy();
      expect(stored.tokenHash).not.toBe(token);
      expect(stored.tokenHash).toBe(
        createHash('sha256').update(token as string).digest('hex'),
      );
    });

    it('does nothing the second time, so a re-sync cannot mail twice', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: 'rev-1' });

      await service.requestFeedback('ship-1');

      expect(prisma.review.create).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('skips a customer with no email rather than failing the delivery', async () => {
      prisma.shipment.findUnique.mockResolvedValue({
        ...SHIPMENT,
        order: { customer: { id: 'c', name: 'Walk In', email: null } },
      });

      await expect(service.requestFeedback('ship-1')).resolves.toBeUndefined();
      expect(prisma.review.create).not.toHaveBeenCalled();
    });

    it('still resolves when the mail provider is down', async () => {
      mail.send.mockResolvedValue(false);
      await expect(service.requestFeedback('ship-1')).resolves.toBeUndefined();
      // The invitation row is already written — the delivery happened regardless of email.
      expect(prisma.review.create).toHaveBeenCalled();
    });
  });

  describe('submit', () => {
    const invite = {
      id: 'rev-1',
      expiresAt: new Date(Date.now() + 60_000),
      submittedAt: null,
    };

    it('records the rating and leaves it unapproved', async () => {
      prisma.review.findUnique.mockResolvedValue(invite);

      await service.submit('raw-token', { rating: 5, comment: 'Great service' });

      const { data } = prisma.review.update.mock.calls[0][0];
      expect(data.rating).toBe(5);
      // Nothing a stranger types reaches the homepage unread.
      expect(data.approved).toBe(false);
      expect(data.submittedAt).toBeInstanceOf(Date);
    });

    it('refuses a second submission through the same link', async () => {
      prisma.review.findUnique.mockResolvedValue({
        ...invite,
        submittedAt: new Date(),
      });
      await expect(
        service.submit('raw', { rating: 1 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an expired link', async () => {
      prisma.review.findUnique.mockResolvedValue({
        ...invite,
        expiresAt: new Date(Date.now() - 60_000),
      });
      await expect(service.submit('raw', { rating: 5 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses an unknown token with the same message as an expired one', async () => {
      prisma.review.findUnique.mockResolvedValue(null);
      await expect(service.submit('raw', { rating: 5 })).rejects.toThrow(
        'This feedback link is invalid or has expired.',
      );
    });
  });

  describe('publishedReviews', () => {
    it('returns only approved reviews that actually have something to quote', async () => {
      await service.publishedReviews();
      const { where } = prisma.review.findMany.mock.calls[0][0];
      expect(where.approved).toBe(true);
      expect(where.comment).toEqual({ not: null });
    });
  });
});
