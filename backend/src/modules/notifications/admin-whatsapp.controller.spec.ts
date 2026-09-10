import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminWhatsAppController } from './admin-whatsapp.controller';

const TEMPLATES = {
  delivery_exception: { id: 't-exc', params: ['trackingNumber'] },
  // A custom template the app has no wording for, with the auto-filled placeholder.
  holiday_greeting: { id: 't-hol', params: ['customerName', 'reopenDate'] },
  invoice_ready: {
    id: 't-inv',
    params: ['customerName', 'invoiceNumber', 'amount'],
  },
  // Must never be listed or sendable as a template — it is the free-text mode.
  custom_text: { id: 't-bad', params: [] },
  // Malformed: no id. Skipped rather than crashing the screen.
  broken: { params: [] },
};

const ADMIN = { sub: 'admin-1' } as never;

describe('AdminWhatsAppController', () => {
  let prisma: {
    customer: { findMany: jest.Mock; findUnique: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let notifications: { enqueue: jest.Mock };
  let controller: AdminWhatsAppController;

  beforeEach(() => {
    prisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c-1', name: 'Tanush Reddy', isActive: true },
          { id: 'c-2', name: 'Harshith Reddy', isActive: true },
          { id: 'c-off', name: 'Old Account', isActive: false },
        ]),
        findUnique: jest.fn().mockResolvedValue({ id: 'c-1', isActive: true }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    notifications = { enqueue: jest.fn().mockResolvedValue('notif-1') };
    controller = new AdminWhatsAppController(
      {
        get: jest.fn((key: string) =>
          key === 'GUPSHUP_TEMPLATES' ? JSON.stringify(TEMPLATES) : undefined,
        ),
      } as never,
      prisma as never,
      notifications as never,
    );
  });

  describe('listTemplates', () => {
    it('lists only well-formed, hand-sendable templates, sorted', () => {
      const names = controller.listTemplates().map((t) => t.name);
      expect(names).toEqual([
        'delivery_exception',
        'holiday_greeting',
        'invoice_ready',
      ]);
    });

    it('previews known wording with placeholders in place, and none for a custom template', () => {
      const byName = Object.fromEntries(
        controller.listTemplates().map((t) => [t.name, t]),
      );
      expect(byName.delivery_exception.body).toContain('{{1}}');
      expect(byName.holiday_greeting.body).toBeNull();
      // Listed so the admin can see it exists, but flagged: it needs its PDF.
      expect(byName.invoice_ready.requiresDocument).toBe(true);
    });
  });

  describe('sendTemplate', () => {
    it("fills customerName from each recipient's own name and reports skipped customers", async () => {
      const result = await controller.sendTemplate(
        {
          customerIds: ['c-1', 'c-2', 'c-off', 'c-gone'],
          template: 'holiday_greeting',
          variables: { reopenDate: '3 Nov' },
        },
        ADMIN,
      );

      expect(result.queued).toBe(2);
      expect(result.failed).toEqual([
        { customerId: 'c-off', reason: 'Customer account is deactivated' },
        { customerId: 'c-gone', reason: 'Customer not found' },
      ]);
      expect(notifications.enqueue).toHaveBeenCalledWith(
        'c-1',
        'WHATSAPP',
        'holiday_greeting',
        { customerName: 'Tanush Reddy', reopenDate: '3 Nov' },
      );
      expect(notifications.enqueue).toHaveBeenCalledWith(
        'c-2',
        'WHATSAPP',
        'holiday_greeting',
        { customerName: 'Harshith Reddy', reopenDate: '3 Nov' },
      );
      // Audit records the send, never the values.
      const audit = prisma.auditLog.create.mock.calls[0][0].data;
      expect(audit.after).toEqual({
        template: 'holiday_greeting',
        recipients: 4,
        queued: 2,
        failed: 2,
      });
    });

    it('keeps an explicitly typed customerName instead of overwriting it', async () => {
      await controller.sendTemplate(
        {
          customerIds: ['c-1'],
          template: 'holiday_greeting',
          variables: { customerName: 'Team', reopenDate: '3 Nov' },
        },
        ADMIN,
      );
      expect(notifications.enqueue).toHaveBeenCalledWith(
        'c-1',
        'WHATSAPP',
        'holiday_greeting',
        { customerName: 'Team', reopenDate: '3 Nov' },
      );
    });

    it.each([
      [
        'a template that carries a PDF',
        {
          template: 'invoice_ready',
          variables: {
            customerName: 'x',
            invoiceNumber: 'NW/1',
            amount: '1',
          },
        },
      ],
      ['an unconfigured template', { template: 'nope', variables: {} }],
      [
        'custom_text, even though it is configured',
        { template: 'custom_text', variables: {} },
      ],
      [
        'a missing placeholder',
        { template: 'delivery_exception', variables: {} },
      ],
      [
        'a line break inside a field, which Meta rejects',
        {
          template: 'delivery_exception',
          variables: { trackingNumber: 'NW-1\nNW-2' },
        },
      ],
    ])('refuses %s before queuing anything', async (_label, body) => {
      await expect(
        controller.sendTemplate({ customerIds: ['c-1'], ...body }, ADMIN),
      ).rejects.toThrow(BadRequestException);
      expect(notifications.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('sendText', () => {
    it('queues the typed message as custom_text, trimmed', async () => {
      const result = await controller.sendText(
        { customerId: 'c-1', text: '  Your parcel is ready to collect.  ' },
        ADMIN,
      );
      expect(result).toEqual({ queued: 1, failed: [] });
      expect(notifications.enqueue).toHaveBeenCalledWith(
        'c-1',
        'WHATSAPP',
        'custom_text',
        { text: 'Your parcel is ready to collect.' },
      );
      // The audit entry records the length, never the words.
      expect(prisma.auditLog.create.mock.calls[0][0].data.after).toEqual({
        length: 32,
      });
    });

    it('404s for an unknown customer', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      await expect(
        controller.sendText({ customerId: 'c-x', text: 'hi' }, ADMIN),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
