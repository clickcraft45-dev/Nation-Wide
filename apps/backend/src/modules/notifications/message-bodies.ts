import { NOTIFICATION_TEMPLATES } from './templates';

/**
 * The actual text customers receive, composed here in code.
 *
 * WHY THIS EXISTS: sending pre-approved Meta templates means every wording change waits on Meta's
 * approval queue. Sending free-form session messages instead puts the wording here, where it can
 * be edited and shipped like any other code — at the cost described below.
 *
 * THE COST, WHICH IS NOT SMALL: WhatsApp only permits free-form messages inside the 24-hour
 * customer service window — the 24 hours following the customer's own most recent message to the
 * business. Outside that window WhatsApp accepts ONLY approved template messages, and a free-form
 * send is rejected by the platform. In practice that means these bodies reach a customer who is
 * mid-conversation, and do NOT reach one who has never messaged the business or last did so
 * days ago. The Gupshup adapter still prefers a configured template whenever one exists for the
 * same notification, so adding an approved template later is a config change, not a code change.
 *
 * LENGTH IS DELIBERATE. These read a little wordier than a chat message needs to be, because the
 * same wording is submitted to Meta as a template (see docs/WHATSAPP_TEMPLATES.md) and Meta
 * rejects templates with "too many variables for its length" — it wants a reasonable amount of
 * fixed text around each {{n}}. The first draft of this file was terse and got exactly that
 * rejection on invoice_ready. Keeping both copies identical is the point: a customer gets the
 * same message whichever path sent it, so shortening one of them re-opens that rejection.
 */

type BodyBuilder = (variables: Record<string, string>) => string;

/**
 * Formats an amount that reached us as a plain numeric string. A non-numeric value passes
 * through as-is rather than becoming "₹NaN".
 *
 * Note this prepends the ₹ itself, whereas the Meta template bodies carry a literal ₹ before
 * their {{n}} — templates receive the bare number as a parameter. Same output, two routes.
 */
function rupees(value: string | undefined): string {
  if (!value) return 'the amount due';
  const amount = Number(value);
  return Number.isFinite(amount) ? `₹${amount.toFixed(2)}` : value;
}

/**
 * A variable with a readable stand-in when it is missing.
 *
 * Every interpolation goes through this. Template literals turn an absent key into the literal
 * string "undefined", and a customer reading "Tracking number: undefined" is a worse outcome than
 * a slightly vaguer sentence. Callers pass these variables as loose Records, so a missing key is
 * a runtime possibility no type checks away.
 */
function or(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

const BODIES: Record<string, BodyBuilder> = {
  [NOTIFICATION_TEMPLATES.ORDER_CONFIRMATION]: (v) =>
    `Your order with NationWide Logistics has been confirmed and is now being processed. Your tracking number is ${or(v.trackingNumber, 'being generated and will follow shortly')}. We will send you an update here each time your shipment moves to its next stage.`,

  [NOTIFICATION_TEMPLATES.TRACKING_NUMBER_ASSIGNED]: (v) =>
    `Your shipment with NationWide Logistics has been assigned a tracking number: ${or(v.trackingNumber, 'available in the app')}. You can use this number to follow your parcel's progress at any time.`,

  [NOTIFICATION_TEMPLATES.PICKED_UP]: (v) =>
    `Good news — your parcel has been picked up. Shipment ${or(v.trackingNumber, 'with NationWide Logistics')} is now with us and on its way to its destination. We will keep you updated as it travels.`,

  [NOTIFICATION_TEMPLATES.IN_TRANSIT]: (v) =>
    `Your shipment ${or(v.trackingNumber, 'with NationWide Logistics')} is currently in transit and moving towards its destination. We will let you know as soon as it is out for delivery.`,

  [NOTIFICATION_TEMPLATES.OUT_FOR_DELIVERY]: (v) =>
    `Your shipment ${or(v.trackingNumber, 'with NationWide Logistics')} is out for delivery today. Please make sure someone is available at the delivery address to receive the parcel.`,

  [NOTIFICATION_TEMPLATES.DELIVERED]: (v) =>
    `Your shipment ${or(v.trackingNumber, 'with NationWide Logistics')} has been delivered successfully and has reached its destination. Thank you for choosing NationWide Logistics for your shipping needs.`,

  [NOTIFICATION_TEMPLATES.EXCEPTION]: (v) =>
    `There is a delay with your shipment ${or(v.trackingNumber, 'with NationWide Logistics')}. Our operations team is looking into it and we will send you an update as soon as the situation is resolved.`,

  [NOTIFICATION_TEMPLATES.QUOTE_READY]: (v) =>
    `Your shipping quote from NationWide Logistics is ready. The total amount for your shipment is ${rupees(v.amount)}. Please open the NationWide Logistics app to review the details and confirm your booking.`,

  [NOTIFICATION_TEMPLATES.QUOTE_REJECTED]: (v) =>
    `We are sorry — we are unable to provide a quote for your shipment at this time. Reason: ${or(v.reason, 'this route or item is not currently serviceable')}. Please reply to this message and our team will help you find an alternative.`,

  [NOTIFICATION_TEMPLATES.PICKUP_CONFIRMED]: (v) =>
    `Your pickup with NationWide Logistics has been confirmed. Current status: ${or(v.status, 'confirmed')}. Our team will contact you if anything further is needed before collection.`,

  [NOTIFICATION_TEMPLATES.PICKUP_REQUEST_NEEDED]: () =>
    `Your quote has been accepted. To continue, please schedule a pickup for your parcel or choose to drop it at our warehouse. You can do this from the NationWide Logistics app.`,

  [NOTIFICATION_TEMPLATES.PICKUP_REQUEST_RECEIVED]: () =>
    `We have received your pickup request with NationWide Logistics. A pickup partner will be assigned shortly, and you will get a message here as soon as that happens.`,

  [NOTIFICATION_TEMPLATES.PICKUP_PARTNER_ASSIGNED]: () =>
    `A pickup partner has been assigned to your request and will arrive during the time slot you selected. Please keep your parcel packed and ready for collection.`,

  [NOTIFICATION_TEMPLATES.PICKUP_VERIFICATION_COMPLETE]: (v) =>
    `Your parcel has been weighed and verified by our pickup partner. The final price for your shipment is ${rupees(v.verifiedPrice)}. This is the amount payable for collection.`,

  [NOTIFICATION_TEMPLATES.PAYMENT_COLLECTED]: (v) =>
    `We have received your payment of ${rupees(v.amount)} for your shipment with NationWide Logistics. Thank you. Your GST invoice will follow separately.`,

  [NOTIFICATION_TEMPLATES.ORDER_CREATED_FROM_PICKUP]: (v) =>
    `Your parcel has been accepted and your order with NationWide Logistics has been created. Your tracking number is ${or(v.trackingNumber, 'being generated and will follow shortly')}. We will update you as your shipment moves.`,

  [NOTIFICATION_TEMPLATES.PICKUP_REJECTED]: (v) =>
    `We were unable to accept your parcel at pickup. Reason: ${or(v.reason, 'the parcel did not meet our acceptance checks')}. Please reply to this message and our team will help you resolve this and arrange a new pickup.`,

  // The longest body here, and deliberately so: it is the only one carrying three variables, and
  // Meta rejected the first, terser draft for having "too many variables for its length".
  [NOTIFICATION_TEMPLATES.INVOICE_READY]: (v) =>
    `Hi ${or(v.customerName, 'there')}, your GST tax invoice from NationWide Logistics is ready. Invoice number: ${or(v.invoiceNumber, 'see the attached document')}. Total amount payable: ${rupees(v.amount)}. The invoice PDF is attached to this message, and you can keep it for your accounting records. If you have any questions about this invoice, please reply to this message and our team will assist you.`,
};

/**
 * The message text for a notification. Falls back to a bland but sane line rather than throwing:
 * a notification nobody wrote a body for should still reach the customer as *something*, not
 * disappear into a failed queue job. New templates are the expected cause, so the fallback is
 * deliberately harmless rather than clever.
 */
export function renderMessageBody(
  template: string,
  variables: Record<string, string>,
): string {
  const build = BODIES[template];
  if (build) return build(variables);
  return 'You have an update on your NationWide Logistics shipment.';
}

/** Exposed so a test can assert every known template has a body. */
export const MESSAGE_BODY_TEMPLATES = Object.keys(BODIES);
