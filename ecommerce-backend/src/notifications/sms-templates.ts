import type { OrderEmailData, StatusEmailData } from './templates';

/**
 * Text messages for the SMS and WhatsApp channels.
 *
 * Not the email body with the tags stripped. An SMS is billed per 160-character
 * segment and read on a lock screen, so it carries the one fact that matters
 * and a way to find the rest. Nothing is escaped here because nothing renders
 * it as markup — the reason `escapeHtml` exists on the email side does not
 * apply, and escaping would put `&amp;` in front of a customer.
 */

/** Keeps a message to one or two segments even with a long store name. */
const MAX_LENGTH = 320;

function clamp(message: string): string {
  return message.length <= MAX_LENGTH ? message : `${message.slice(0, MAX_LENGTH - 1)}…`;
}

export function orderPlacedSms(data: OrderEmailData): string {
  return clamp(
    `${data.storeName}: thanks ${data.customerName}, order ${data.orderNumber} is confirmed. ` +
      `Total ${data.currency} ${data.grandTotal}. ` +
      `Paid by ${data.paymentMethod.toLowerCase()}. We'll message you when it ships.`,
  );
}

/**
 * Only the statuses a customer would want a message about.
 *
 * Texting someone that their order moved to "processing" is the kind of thing
 * that gets a store's messages muted, which then costs it the delivery
 * notification that actually mattered.
 */
const NOTIFIABLE: Record<string, (data: StatusEmailData) => string> = {
  SHIPPED: (d) => `${d.storeName}: order ${d.orderNumber} has shipped.`,
  DELIVERED: (d) => `${d.storeName}: order ${d.orderNumber} was delivered. Thank you!`,
  CANCELLED: (d) =>
    `${d.storeName}: order ${d.orderNumber} was cancelled` +
    `${d.reason ? ` — ${d.reason}` : ''}.`,
  REFUNDED: (d) => `${d.storeName}: order ${d.orderNumber} has been refunded.`,
};

/** Null when this status is not worth a text message. */
export function orderStatusSms(data: StatusEmailData): string | null {
  const build = NOTIFIABLE[data.status];
  return build ? clamp(build(data)) : null;
}
