/**
 * Transactional email templates.
 *
 * Every interpolated value is escaped. Product names, customer names and
 * addresses are attacker-controllable in the sense that anyone can register and
 * type anything into them, and an email client rendering unescaped HTML is the
 * same injection problem as a web page.
 *
 * Plain text is built alongside the HTML rather than stripped from it: some
 * clients only read `text/plain`, and a mangled fallback reads as spam.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface OrderEmailData {
  storeName: string;
  storeEmail: string;
  brandColor: string;
  orderNumber: string;
  customerName: string;
  currency: string;
  items: { name: string; variantName?: string | null; quantity: number; lineTotal: string }[];
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  shippingTotal: string;
  grandTotal: string;
  shippingAddress: {
    fullName: string;
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  paymentMethod: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Currency is formatted server-side so the email matches the invoice exactly. */
function amount(value: string, currency: string): string {
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) return `${currency} —`;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

export function orderConfirmation(data: OrderEmailData): RenderedEmail {
  const e = escapeHtml;
  const money = (v: string) => amount(v, data.currency);

  const rows = data.items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee">
            ${e(item.name)}${item.variantName ? ` <span style="color:#777">· ${e(item.variantName)}</span>` : ''}
            <div style="color:#777;font-size:12px">Qty ${item.quantity}</div>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">
            ${e(money(item.lineTotal))}
          </td>
        </tr>`,
    )
    .join('');

  const totalRow = (label: string, value: string, bold = false) => `
    <tr>
      <td style="padding:4px 0;color:#555${bold ? ';font-weight:600;color:#111' : ''}">${e(label)}</td>
      <td style="padding:4px 0;text-align:right${bold ? ';font-weight:600' : ''}">${e(value)}</td>
    </tr>`;

  const address = data.shippingAddress;

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
  <h1 style="font-size:20px;margin:0 0 4px">Thank you for your order</h1>
  <p style="color:#555;margin:0 0 24px">
    ${e(data.storeName)} has received order
    <strong style="color:${e(data.brandColor)}">${e(data.orderNumber)}</strong>.
  </p>

  <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>

  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px">
    ${totalRow('Subtotal', money(data.subtotal))}
    ${Number(data.discountTotal) > 0 ? totalRow('Discount', `−${money(data.discountTotal)}`) : ''}
    ${totalRow('Tax', money(data.taxTotal))}
    ${totalRow('Shipping', Number(data.shippingTotal) === 0 ? 'Free' : money(data.shippingTotal))}
    ${totalRow('Total', money(data.grandTotal), true)}
  </table>

  <h2 style="font-size:14px;margin:24px 0 8px">Delivering to</h2>
  <p style="color:#555;font-size:14px;line-height:1.6;margin:0">
    ${e(address.fullName)}<br>
    ${e(address.line1)}<br>
    ${address.line2 ? `${e(address.line2)}<br>` : ''}
    ${e(address.city)}, ${e(address.state)} ${e(address.postalCode)}<br>
    ${e(address.country)}
  </p>

  <p style="color:#555;font-size:14px;margin:24px 0 0">
    Payment: ${e(data.paymentMethod)}
  </p>

  <p style="color:#888;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:16px">
    Questions? Reply to this email or contact ${e(data.storeEmail)}.
  </p>
</div>`.trim();

  const text = [
    `Thank you for your order`,
    ``,
    `${data.storeName} has received order ${data.orderNumber}.`,
    ``,
    ...data.items.map(
      (i) =>
        `  ${i.quantity} x ${i.name}${i.variantName ? ` (${i.variantName})` : ''} — ${money(i.lineTotal)}`,
    ),
    ``,
    `  Subtotal: ${money(data.subtotal)}`,
    ...(Number(data.discountTotal) > 0 ? [`  Discount: -${money(data.discountTotal)}`] : []),
    `  Tax:      ${money(data.taxTotal)}`,
    `  Shipping: ${Number(data.shippingTotal) === 0 ? 'Free' : money(data.shippingTotal)}`,
    `  Total:    ${money(data.grandTotal)}`,
    ``,
    `Delivering to:`,
    `  ${address.fullName}`,
    `  ${address.line1}`,
    ...(address.line2 ? [`  ${address.line2}`] : []),
    `  ${address.city}, ${address.state} ${address.postalCode}`,
    `  ${address.country}`,
    ``,
    `Payment: ${data.paymentMethod}`,
    ``,
    `Questions? Contact ${data.storeEmail}.`,
  ].join('\n');

  return {
    // Deliberately "received", not "confirmed": the merchant sends a separate
    // CONFIRMED status email moments later, and two messages sharing a subject
    // line read as a duplicate rather than as two steps.
    subject: `${data.storeName} — we've received order ${data.orderNumber}`,
    html,
    text,
  };
}

export interface StatusEmailData {
  storeName: string;
  storeEmail: string;
  orderNumber: string;
  customerName: string;
  status: string;
  reason?: string | null;
}

/** Wording per status, because "your order is PACKED" is not a sentence. */
const STATUS_COPY: Record<string, { subject: string; line: string }> = {
  CONFIRMED: { subject: 'confirmed', line: 'We have confirmed your order and will prepare it shortly.' },
  PROCESSING: { subject: 'being prepared', line: 'Your order is being prepared.' },
  PACKED: { subject: 'packed', line: 'Your order is packed and waiting for collection.' },
  SHIPPED: { subject: 'on its way', line: 'Your order has been handed to the carrier.' },
  DELIVERED: { subject: 'delivered', line: 'Your order has been delivered. We hope you enjoy it.' },
  CANCELLED: { subject: 'cancelled', line: 'Your order has been cancelled.' },
  REFUNDED: { subject: 'refunded', line: 'Your order has been refunded.' },
};

export function orderStatusChanged(data: StatusEmailData): RenderedEmail {
  const e = escapeHtml;
  const copy = STATUS_COPY[data.status] ?? {
    subject: data.status.toLowerCase(),
    line: `Your order is now ${data.status.toLowerCase()}.`,
  };

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
  <h1 style="font-size:20px;margin:0 0 4px">Order ${e(data.orderNumber)}</h1>
  <p style="color:#555;margin:0 0 16px">${e(copy.line)}</p>
  ${data.reason ? `<p style="color:#555;margin:0 0 16px">Reason: ${e(data.reason)}</p>` : ''}
  <p style="color:#888;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:16px">
    ${e(data.storeName)} · ${e(data.storeEmail)}
  </p>
</div>`.trim();

  const text = [
    `Order ${data.orderNumber}`,
    ``,
    copy.line,
    ...(data.reason ? [``, `Reason: ${data.reason}`] : []),
    ``,
    `${data.storeName} · ${data.storeEmail}`,
  ].join('\n');

  return {
    subject: `${data.storeName} — order ${data.orderNumber} ${copy.subject}`,
    html,
    text,
  };
}

export function customerWelcome(data: {
  storeName: string;
  storeEmail: string;
  customerName: string;
}): RenderedEmail {
  const e = escapeHtml;

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
  <h1 style="font-size:20px;margin:0 0 4px">Welcome, ${e(data.customerName)}</h1>
  <p style="color:#555;margin:0 0 16px">
    Your ${e(data.storeName)} account is ready. Your order history and saved details live there.
  </p>
  <p style="color:#888;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:16px">
    ${e(data.storeName)} · ${e(data.storeEmail)}
  </p>
</div>`.trim();

  const text = [
    `Welcome, ${data.customerName}`,
    ``,
    `Your ${data.storeName} account is ready.`,
    ``,
    `${data.storeName} · ${data.storeEmail}`,
  ].join('\n');

  return { subject: `Welcome to ${data.storeName}`, html, text };
}

/**
 * The verification code.
 *
 * Deliberately the plainest template here: no marketing, no images, one number
 * shown large. A code email that looks like a promotion gets filtered, and the
 * only thing the reader wants is six digits they can retype.
 */
export function emailVerificationCode(data: {
  storeName: string;
  storeEmail: string;
  code: string;
  expiresInMinutes: number;
}): RenderedEmail {
  const e = escapeHtml;
  // Spaced for reading, not for typing — the form accepts it either way.
  const spaced = data.code.replace(/(\d{3})(\d{3})/, '$1 $2');

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
  <h1 style="font-size:20px;margin:0 0 4px">Confirm your email</h1>
  <p style="color:#555;margin:0 0 20px">
    Enter this code to finish creating your ${e(data.storeName)} account.
  </p>
  <p style="font-size:30px;letter-spacing:6px;font-weight:600;margin:0 0 20px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">
    ${e(spaced)}
  </p>
  <p style="color:#555;margin:0 0 4px">
    It expires in ${data.expiresInMinutes} minutes.
  </p>
  <p style="color:#888;font-size:13px;margin:0">
    If you did not ask for this, ignore this email — no account is created until the code is entered.
  </p>
  <p style="color:#888;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:16px">
    ${e(data.storeName)} · ${e(data.storeEmail)}
  </p>
</div>`.trim();

  const text = [
    `Confirm your email`,
    ``,
    `Enter this code to finish creating your ${data.storeName} account:`,
    ``,
    `    ${data.code}`,
    ``,
    `It expires in ${data.expiresInMinutes} minutes.`,
    `If you did not ask for this, ignore this email — no account is created until the code is entered.`,
    ``,
    `${data.storeName} · ${data.storeEmail}`,
  ].join('\n');

  return { subject: `${data.code} is your ${data.storeName} verification code`, html, text };
}

/**
 * The email a new store owner gets the moment their store is provisioned.
 *
 * Sent to the business address they were created with, not to a platform
 * address: this is the message that tells someone their store exists and where
 * to sign in, so it has to reach the person who will run it.
 *
 * The password is deliberately absent. Whoever created the store chose it and
 * can pass it on; putting it in an email leaves a working credential sitting in
 * an inbox forever. What is included is the one thing they cannot work out for
 * themselves — the address their admin lives at — plus the short list of things
 * a store cannot open without.
 */
export function storeSetup(data: {
  storeName: string;
  ownerName: string;
  adminUrl: string;
  storefrontUrl: string;
  platformName: string;
  supportEmail: string;
  email: string;
}): RenderedEmail {
  const e = escapeHtml;

  const steps: [string, string][] = [
    ['Set up payments', 'Connect your own payment account, or switch on cash on delivery. Until one is active, shoppers cannot complete checkout.'],
    ['Add your branding', 'Upload a logo, choose your colours and pick a background.'],
    ['Add products', 'With photos — a catalogue without images does not sell.'],
    ['Set delivery charges', 'Shipping zones and rates for where you deliver.'],
    ['Publish', 'Your storefront stays private until you turn it on in Settings.'],
  ];

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
  <p style="color:#888;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 8px">
    ${e(data.platformName)}
  </p>
  <h1 style="font-size:22px;margin:0 0 4px">${e(data.storeName)} is ready</h1>
  <p style="color:#555;margin:0 0 20px">
    Hello ${e(data.ownerName)} — your store has been created and you are its owner.
  </p>

  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
    <tr><td>
      <a href="${e(data.adminUrl)}"
         style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px">
        Open your admin
      </a>
    </td></tr>
  </table>

  <p style="color:#555;margin:0 0 6px;font-size:14px">
    Sign in with <strong>${e(data.email)}</strong> and the password chosen when your store was set up.
  </p>
  <p style="color:#888;margin:0 0 24px;font-size:13px">
    Your storefront: <a href="${e(data.storefrontUrl)}" style="color:#111">${e(data.storefrontUrl)}</a>
  </p>

  <h2 style="font-size:15px;margin:0 0 10px;border-top:1px solid #eee;padding-top:20px">
    Five things to do first
  </h2>
  <ol style="color:#555;font-size:14px;padding-left:20px;margin:0 0 24px">
    ${steps
      .map(
        ([title, detail]) =>
          `<li style="margin-bottom:10px"><strong style="color:#111">${e(title)}.</strong> ${e(detail)}</li>`,
      )
      .join('\n    ')}
  </ol>

  <p style="color:#888;font-size:12px;margin-top:8px;border-top:1px solid #eee;padding-top:16px">
    Questions? Reply to this email or write to ${e(data.supportEmail)}.
  </p>
</div>`.trim();

  const text = [
    `${data.storeName} is ready`,
    ``,
    `Hello ${data.ownerName} — your store has been created and you are its owner.`,
    ``,
    `Admin:      ${data.adminUrl}`,
    `Storefront: ${data.storefrontUrl}`,
    `Sign in as: ${data.email}`,
    `Password:   the one chosen when your store was set up.`,
    ``,
    `Five things to do first:`,
    ...steps.map(([title, detail], i) => `  ${i + 1}. ${title}. ${detail}`),
    ``,
    `Questions? Reply to this email or write to ${data.supportEmail}.`,
  ].join('\n');

  return { subject: `${data.storeName} is ready — here is your admin`, html, text };
}
