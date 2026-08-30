import { ConfigService } from '@nestjs/config';
import { GupshupWhatsAppAdapter } from './gupshup-whatsapp.adapter';

const TEMPLATES = JSON.stringify({
  invoice_ready: {
    id: 'tpl-uuid-1',
    params: ['customerName', 'invoiceNumber', 'amount'],
  },
});

// No GUPSHUP_TEMPLATES by default: free-form session messages are the configured setup, and
// templates are opt-in per notification. Tests that exercise the template path pass them in.
function makeConfig(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    GUPSHUP_API_KEY: 'test-api-key',
    GUPSHUP_SOURCE_PHONE: '+91 83283 65513',
    GUPSHUP_APP_NAME: 'NationWide',
    ...overrides,
  };
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`${key} missing`);
      return value;
    },
  } as unknown as ConfigService;
}

/** Reads the form-encoded body back out of the recorded fetch call. */
function bodyOf(mock: jest.Mock): URLSearchParams {
  return (mock.mock.calls[0][1] as { body: URLSearchParams }).body;
}

/** The session endpoint answers "submitted"; the template endpoint answers "success". */
function okResponse(status = 'submitted') {
  return {
    ok: true,
    status: 202,
    json: () => Promise.resolve({ messageId: 'wamid-123', status }),
  };
}

/** The endpoint URL the adapter actually called. */
function urlOf(mock: jest.Mock): string {
  return mock.mock.calls[0][0] as string;
}

const SESSION_URL = 'https://api.gupshup.io/wa/api/v1/msg';
const TEMPLATE_URL = 'https://api.gupshup.io/wa/api/v1/template/msg';

describe('GupshupWhatsAppAdapter', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock;
  });

  describe('isConfigured', () => {
    it('needs the credentials, but NOT templates', () => {
      expect(GupshupWhatsAppAdapter.isConfigured(makeConfig())).toBe(true);
      expect(
        GupshupWhatsAppAdapter.isConfigured(
          makeConfig({ GUPSHUP_API_KEY: undefined }),
        ),
      ).toBe(false);
      expect(
        GupshupWhatsAppAdapter.isConfigured(
          makeConfig({ GUPSHUP_APP_NAME: undefined }),
        ),
      ).toBe(false);
    });
  });

  describe('free-form session messages (no template configured)', () => {
    it('sends text to the session endpoint with the body from message-bodies', async () => {
      const adapter = new GupshupWhatsAppAdapter(makeConfig());

      await adapter.sendTemplateMessage('+919876543210', 'delivered', {
        trackingNumber: 'NW-26-000123',
      });

      expect(urlOf(fetchMock)).toBe(SESSION_URL);
      const message = JSON.parse(bodyOf(fetchMock).get('message')!) as {
        type: string;
        text: string;
      };
      expect(message.type).toBe('text');
      expect(message.text).toContain('NW-26-000123');
      // No template field at all — the session endpoint rejects one.
      expect(bodyOf(fetchMock).get('template')).toBeNull();
    });

    // The PDF and the line explaining it must arrive together; a bare attachment with no text is
    // what an orphaned two-message send looks like on the customer's phone.
    it('sends a PDF as a single file message carrying the text as its caption', async () => {
      const adapter = new GupshupWhatsAppAdapter(makeConfig());

      await adapter.sendDocumentMessage(
        '+919876543210',
        'invoice_ready',
        {
          customerName: 'Ravi Kumar',
          invoiceNumber: 'NW/2026-27/00042',
          amount: '808',
        },
        {
          url: 'https://api.nationwidelogistics.co/api/v1/public/invoices/inv-1/tok',
          filename: 'NW-2026-27-00042.pdf',
        },
      );

      expect(urlOf(fetchMock)).toBe(SESSION_URL);
      const message = JSON.parse(bodyOf(fetchMock).get('message')!) as {
        type: string;
        url: string;
        filename: string;
        caption: string;
      };
      expect(message.type).toBe('file');
      expect(message.url).toBe(
        'https://api.nationwidelogistics.co/api/v1/public/invoices/inv-1/tok',
      );
      expect(message.filename).toBe('NW-2026-27-00042.pdf');
      expect(message.caption).toContain('NW/2026-27/00042');
      expect(message.caption).toContain('Ravi Kumar');
      expect(message.caption).toContain('808.00');
    });

    it('accepts the session endpoint\'s "submitted" status as success', async () => {
      fetchMock.mockResolvedValue(okResponse('submitted'));
      const adapter = new GupshupWhatsAppAdapter(makeConfig());
      await expect(
        adapter.sendTemplateMessage('+919876543210', 'delivered', {}),
      ).resolves.toEqual({ providerMessageId: 'wamid-123' });
    });

    // An unknown notification must still reach the customer as something, rather than dying in
    // the queue over a missing body.
    it('falls back to a generic body for a template with no wording written', async () => {
      const adapter = new GupshupWhatsAppAdapter(makeConfig());
      await adapter.sendTemplateMessage('+919876543210', 'not_a_real_one', {});

      const message = JSON.parse(bodyOf(fetchMock).get('message')!) as {
        text: string;
      };
      expect(message.text).toContain('NationWide Logistics');
    });
  });

  // The regression this guards is silent and customer-visible: Gupshup's template params are
  // POSITIONAL, while this app passes an unordered Record. Order must come from config, never
  // from object key order, or the amount lands where the customer's name belongs.
  it('orders template params by the configured placeholder order, not object key order', async () => {
    fetchMock.mockResolvedValue(okResponse('success'));
    const adapter = new GupshupWhatsAppAdapter(
      makeConfig({ GUPSHUP_TEMPLATES: TEMPLATES }),
    );

    await adapter.sendTemplateMessage('+919876543210', 'invoice_ready', {
      // Deliberately shuffled relative to the configured order.
      amount: '808.00',
      customerName: 'Ravi Kumar',
      invoiceNumber: 'NW/2026-27/00042',
    });

    const template = JSON.parse(bodyOf(fetchMock).get('template')!) as {
      id: string;
      params: string[];
    };
    expect(urlOf(fetchMock)).toBe(TEMPLATE_URL);
    expect(template.id).toBe('tpl-uuid-1');
    expect(template.params).toEqual([
      'Ravi Kumar',
      'NW/2026-27/00042',
      '808.00',
    ]);
  });

  it('sends an empty string for a placeholder with no matching variable', async () => {
    const adapter = new GupshupWhatsAppAdapter(
      makeConfig({ GUPSHUP_TEMPLATES: TEMPLATES }),
    );

    await adapter.sendTemplateMessage('+919876543210', 'invoice_ready', {
      customerName: 'Ravi Kumar',
    });

    const template = JSON.parse(bodyOf(fetchMock).get('template')!) as {
      params: string[];
    };
    // Not the literal string "undefined", which is what a naive lookup would put in front of
    // a customer.
    expect(template.params).toEqual(['Ravi Kumar', '', '']);
  });

  it('strips + and formatting from both source and destination numbers', async () => {
    const adapter = new GupshupWhatsAppAdapter(makeConfig());

    await adapter.sendTemplateMessage('+91 98765-43210', 'delivered', {});

    const body = bodyOf(fetchMock);
    expect(body.get('destination')).toBe('919876543210');
    expect(body.get('source')).toBe('918328365513');
    expect(body.get('channel')).toBe('whatsapp');
    expect(body.get('src.name')).toBe('NationWide');
  });

  it('attaches a document as a link, and omits the message field entirely without one', async () => {
    const adapter = new GupshupWhatsAppAdapter(
      makeConfig({ GUPSHUP_TEMPLATES: TEMPLATES }),
    );

    await adapter.sendDocumentMessage(
      '+919876543210',
      'invoice_ready',
      { customerName: 'Ravi Kumar' },
      {
        url: 'https://api.nationwidelogistics.co/api/v1/public/invoices/inv-1/tok',
        filename: 'NW-2026-27-00042.pdf',
      },
    );

    const message = JSON.parse(bodyOf(fetchMock).get('message')!) as {
      type: string;
      document: Record<string, string>;
    };
    expect(message.type).toBe('document');
    expect(message.document).toEqual({
      link: 'https://api.nationwidelogistics.co/api/v1/public/invoices/inv-1/tok',
      filename: 'NW-2026-27-00042.pdf',
    });
    // link and id are alternatives — sending both is a rejected request.
    expect(message.document).not.toHaveProperty('id');

    fetchMock.mockClear();
    await adapter.sendTemplateMessage('+919876543210', 'invoice_ready', {});
    expect(bodyOf(fetchMock).get('message')).toBeNull();
  });

  it('sends the api key as a header, never in the body', async () => {
    const adapter = new GupshupWhatsAppAdapter(makeConfig());

    await adapter.sendTemplateMessage('+919876543210', 'delivered', {});

    const init = fetchMock.mock.calls[0][1] as {
      headers: Record<string, string>;
    };
    expect(init.headers.apikey).toBe('test-api-key');
    expect(init.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(bodyOf(fetchMock).get('apikey')).toBeNull();
  });

  it('accepts the template endpoint\'s "success" status too', async () => {
    fetchMock.mockResolvedValue(okResponse('success'));
    const adapter = new GupshupWhatsAppAdapter(
      makeConfig({ GUPSHUP_TEMPLATES: TEMPLATES }),
    );
    await expect(
      adapter.sendTemplateMessage('+919876543210', 'invoice_ready', {}),
    ).resolves.toEqual({ providerMessageId: 'wamid-123' });
  });

  describe('failures throw, so the queue retries and the row is marked FAILED', () => {
    it("throws on a non-2xx response, surfacing Gupshup's own message", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            message: 'Authentication Failed',
            status: 'error',
          }),
      });
      const adapter = new GupshupWhatsAppAdapter(makeConfig());

      await expect(
        adapter.sendTemplateMessage('+919876543210', 'delivered', {}),
      ).rejects.toThrow('Authentication Failed');
    });

    // Gupshup can answer 200 with status:"error" — treating HTTP 200 as success would record a
    // message id that never existed and silently mark the notification SENT.
    it('throws on a 200 that is not status:success', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ message: 'Invalid Destination', status: 'error' }),
      });
      const adapter = new GupshupWhatsAppAdapter(makeConfig());

      await expect(
        adapter.sendTemplateMessage('+919876543210', 'delivered', {}),
      ).rejects.toThrow('Invalid Destination');
    });

    // A notification with no configured template is NOT an error any more — it is the normal
    // free-form route. Only a template that IS configured, but malformed, is a fault.
    it('falls through to free-form for a template absent from the map', async () => {
      const adapter = new GupshupWhatsAppAdapter(
        makeConfig({ GUPSHUP_TEMPLATES: TEMPLATES }),
      );

      await adapter.sendTemplateMessage('+919876543210', 'order_confirmation', {
        trackingNumber: 'NW-26-000123',
      });

      expect(urlOf(fetchMock)).toBe(SESSION_URL);
    });

    it('throws on a configured-but-malformed template entry', async () => {
      const adapter = new GupshupWhatsAppAdapter(
        makeConfig({
          GUPSHUP_TEMPLATES: JSON.stringify({ invoice_ready: { id: 'x' } }),
        }),
      );

      await expect(
        adapter.sendTemplateMessage('+919876543210', 'invoice_ready', {}),
      ).rejects.toThrow(/Malformed Gupshup template config/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    // Loud, not silent: a typo here would otherwise downgrade every notification to free-form,
    // which passes in testing (the tester just messaged in) and fails in production.
    it('rejects unparseable GUPSHUP_TEMPLATES instead of silently going free-form', async () => {
      const adapter = new GupshupWhatsAppAdapter(
        makeConfig({ GUPSHUP_TEMPLATES: 'not-json' }),
      );
      await expect(
        adapter.sendTemplateMessage('+919876543210', 'invoice_ready', {}),
      ).rejects.toThrow('GUPSHUP_TEMPLATES is not valid JSON');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
