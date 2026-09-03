import { MESSAGE_BODY_TEMPLATES, renderMessageBody } from './message-bodies';
import { NOTIFICATION_TEMPLATES } from './templates';

describe('message bodies', () => {
  // Adding a notification without wording is easy to do and invisible until a customer gets the
  // generic fallback. This fails the moment NOTIFICATION_TEMPLATES grows an entry.
  it.each(Object.entries(NOTIFICATION_TEMPLATES))(
    '%s has a body written for it',
    (_name, template) => {
      expect(MESSAGE_BODY_TEMPLATES).toContain(template);
    },
  );

  it('interpolates the variables each notification actually passes', () => {
    expect(
      renderMessageBody(NOTIFICATION_TEMPLATES.DELIVERED, {
        trackingNumber: 'NW-26-000123',
      }),
    ).toContain('NW-26-000123');

    expect(
      renderMessageBody(NOTIFICATION_TEMPLATES.PICKUP_REJECTED, {
        reason: 'Parcel not packed',
      }),
    ).toContain('Parcel not packed');
  });

  it('formats amounts as rupees to two places', () => {
    expect(
      renderMessageBody(NOTIFICATION_TEMPLATES.PAYMENT_COLLECTED, {
        amount: '808',
      }),
    ).toContain('₹808.00');
  });

  // Amounts reach here as strings straight off DTOs; a non-numeric one must not become "₹NaN".
  it('passes a non-numeric amount through untouched rather than printing NaN', () => {
    const body = renderMessageBody(NOTIFICATION_TEMPLATES.QUOTE_READY, {
      amount: 'on request',
    });
    expect(body).toContain('on request');
    expect(body).not.toContain('NaN');
  });

  it('never leaves the literal "undefined" in front of a customer', () => {
    for (const template of MESSAGE_BODY_TEMPLATES) {
      // Every body rendered with NO variables at all — the worst case a caller can produce.
      expect(renderMessageBody(template, {})).not.toContain('undefined');
    }
  });

  it('falls back to a harmless line for a template with no body', () => {
    expect(renderMessageBody('some_future_template', {})).toContain(
      'NationWide Logistics',
    );
  });
});
