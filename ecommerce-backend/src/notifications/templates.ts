/**
 * Transactional email templates.
 *
 * Each one is assembly rather than authorship: the layout, spacing, colour and
 * type all come from `email-theme.ts` and `email-components.ts`, so the eight
 * messages a shop sends look like eight messages from the same shop. Anything
 * visual belongs in those two files, not here.
 *
 * ## What every template guarantees
 *
 * Every interpolated value is escaped. Product names, customer names and
 * addresses are attacker-controllable in the sense that anyone can register and
 * type anything into them, and an email client rendering unescaped HTML is the
 * same injection problem as a web page. The tenant's colour and logo get
 * stronger treatment still — validated rather than escaped — because they reach
 * a `bgcolor` attribute and an `src`, which escaping does not make safe. See
 * `safeHex` and `safeUrl`.
 *
 * Plain text is built alongside the HTML rather than stripped from it: some
 * clients only read `text/plain`, and a mangled fallback reads as spam. The
 * text parts are also what a failed send is replayed from, so they are written
 * once and left alone — the redesign above them changed no plain-text byte.
 *
 * Subjects are never escaped. A store called "Tom & Jerry" must arrive in the
 * inbox as "Tom & Jerry"; what is stripped from them instead is CR and LF,
 * which in a mail header is injection.
 */
import {
  codeBlock,
  cta,
  divider,
  eyebrow,
  h1,
  h2,
  itemsTable,
  lede,
  openCard,
  panel,
  panelBody,
  panelLabel,
  paragraph,
  shell,
  small,
  spacer,
  totalRow,
  totalsRule,
  type EmailBrand,
} from './email-components';
import {
  DEFAULT_BRAND,
  INK,
  MONO,
  SANS,
  escapeHtml,
  safeHex,
  subjectSafe,
} from './email-theme';

export { escapeHtml };
export type { EmailBrand };

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

/**
 * The store's identity, resolved once per send by `NotificationsService`.
 *
 * Optional on every template, and derived from the message's own data when
 * absent, so the existing call sites and specs compile unchanged. It must stay
 * optional: making it required would not force callers to pass it — it would
 * make a half-updated call site fail to compile in one place and silently fall
 * back to defaults in another.
 */
function resolveBrand(
  data: { storeName: string; storeEmail: string; brandColor?: string },
  brand?: EmailBrand,
): EmailBrand {
  const source = brand ?? {
    storeName: data.storeName,
    storeEmail: data.storeEmail,
    brandColor: data.brandColor ?? DEFAULT_BRAND,
    logoUrl: null,
    storefrontUrl: null,
  };

  // Normalised here rather than trusted, because a row written by a seed, a
  // migration or an older build never passed through the API's validation.
  return { ...source, brandColor: safeHex(source.brandColor) };
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

/** A mono run for an order number sitting inside a sentence. */
const ref = (value: string): string =>
  `<span style="font-family:${MONO};font-size:14px;font-weight:700;color:${INK.STRONG};white-space:nowrap;">${escapeHtml(value)}</span>`;

// -----------------------------------------------------------------------------

export function orderConfirmation(data: OrderEmailData, brand?: EmailBrand): RenderedEmail {
  const e = escapeHtml;
  const money = (v: string) => amount(v, data.currency);
  const store = resolveBrand(data, brand);
  const address = data.shippingAddress;
  const hasDiscount = Number(data.discountTotal) > 0;

  const totals =
    totalRow('Subtotal', money(data.subtotal)) +
    (hasDiscount ? totalRow('Discount', `−${money(data.discountTotal)}`) : '') +
    totalRow('Tax', money(data.taxTotal)) +
    totalRow(
      'Shipping',
      Number(data.shippingTotal) === 0 ? 'Free' : money(data.shippingTotal),
    ) +
    totalsRule() +
    totalRow('Total', money(data.grandTotal), true);

  const html = shell({
    brand: store,
    title: `Order ${data.orderNumber}`,
    preheader: `We have your order ${data.orderNumber}. Total ${money(data.grandTotal)}.`,
    sections: [
      openCard(store) +
        eyebrow('Order received') +
        spacer(10) +
        h1(`Thank you, ${data.customerName}`) +
        spacer(14) +
        lede(`${e(store.storeName)} has your order ${ref(data.orderNumber)} and is preparing it now.`) +
        // Only when a storefront address is known. An email that says "view your
        // order" and links nowhere is worse than one that does not offer.
        cta(
          'View your orders',
          store.storefrontUrl ? `${store.storefrontUrl}/account` : null,
          store.brandColor,
        ) +
        spacer(28),

      spacer(28) +
        h2('What you ordered') +
        spacer(16) +
        itemsTable(data.items, money) +
        spacer(18) +
        `<tr><td class="sm-px" style="padding:0 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${totals}</table></td></tr>` +
        spacer(32),

      spacer(28) +
        panel(
          panelLabel('Delivering to') +
            panelBody(
              `${e(address.fullName)}<br>${e(address.line1)}<br>` +
                (address.line2 ? `${e(address.line2)}<br>` : '') +
                `${e(address.city)}, ${e(address.state)} ${e(address.postalCode)}<br>${e(address.country)}`,
            ),
        ) +
        spacer(16) +
        panel(panelLabel('Payment') + panelBody(e(data.paymentMethod))) +
        spacer(28) +
        divider() +
        spacer(20) +
        small(`Questions about this order? Reply to this email or write to ${e(store.storeEmail)}.`) +
        spacer(32),
    ],
  });

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
    ...(hasDiscount ? [`  Discount: -${money(data.discountTotal)}`] : []),
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
    subject: subjectSafe(`${data.storeName} — we've received order ${data.orderNumber}`),
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
const STATUS_COPY: Record<
  string,
  { subject: string; line: string; headline: string }
> = {
  CONFIRMED: {
    subject: 'confirmed',
    line: 'We have confirmed your order and will prepare it shortly.',
    headline: 'Your order is confirmed',
  },
  PROCESSING: {
    subject: 'being prepared',
    line: 'Your order is being prepared.',
    headline: 'Your order is being prepared',
  },
  PACKED: {
    subject: 'packed',
    line: 'Your order is packed and waiting for collection.',
    headline: 'Your order is packed',
  },
  SHIPPED: {
    subject: 'on its way',
    line: 'Your order has been handed to the carrier.',
    headline: 'Your order is on its way',
  },
  DELIVERED: {
    subject: 'delivered',
    line: 'Your order has been delivered. We hope you enjoy it.',
    headline: 'Your order has been delivered',
  },
  CANCELLED: {
    subject: 'cancelled',
    line: 'Your order has been cancelled.',
    headline: 'Your order has been cancelled',
  },
  REFUNDED: {
    subject: 'refunded',
    line: 'Your order has been refunded.',
    headline: 'Your order has been refunded',
  },
};

export function orderStatusChanged(data: StatusEmailData, brand?: EmailBrand): RenderedEmail {
  const e = escapeHtml;
  const store = resolveBrand(data, brand);
  const copy = STATUS_COPY[data.status] ?? {
    subject: data.status.toLowerCase(),
    line: `Your order is now ${data.status.toLowerCase()}.`,
    headline: `Order ${data.orderNumber}`,
  };

  const html = shell({
    brand: store,
    title: `Order ${data.orderNumber}`,
    preheader: copy.line,
    sections: [
      openCard(store) +
        eyebrow('Order update') +
        spacer(10) +
        h1(copy.headline) +
        spacer(14) +
        lede(`${e(copy.line)}`) +
        spacer(20) +
        panel(panelLabel('Order') + panelBody(ref(data.orderNumber))) +
        (data.reason
          ? spacer(16) + panel(panelLabel('Reason') + panelBody(e(data.reason)))
          : '') +
        cta(
          'View your orders',
          store.storefrontUrl ? `${store.storefrontUrl}/account` : null,
          store.brandColor,
        ) +
        spacer(28) +
        divider() +
        spacer(20) +
        small(`Questions? Reply to this email or write to ${e(store.storeEmail)}.`) +
        spacer(32),
    ],
  });

  const text = [
    `Order ${data.orderNumber}`,
    ``,
    copy.line,
    ...(data.reason ? [``, `Reason: ${data.reason}`] : []),
    ``,
    `${data.storeName} · ${data.storeEmail}`,
  ].join('\n');

  return {
    subject: subjectSafe(`${data.storeName} — order ${data.orderNumber} ${copy.subject}`),
    html,
    text,
  };
}

export function customerWelcome(
  data: { storeName: string; storeEmail: string; customerName: string },
  brand?: EmailBrand,
): RenderedEmail {
  const e = escapeHtml;
  const store = resolveBrand(data, brand);

  const html = shell({
    brand: store,
    title: `Welcome to ${data.storeName}`,
    preheader: `Your ${data.storeName} account is ready.`,
    sections: [
      openCard(store) +
        eyebrow('Account created') +
        spacer(10) +
        h1(`Welcome, ${data.customerName}`) +
        spacer(14) +
        lede(
          `Your ${e(store.storeName)} account is ready. Your order history and saved details live there.`,
        ) +
        cta('Start shopping', store.storefrontUrl ?? null, store.brandColor) +
        spacer(28) +
        divider() +
        spacer(20) +
        small(`Questions? Reply to this email or write to ${e(store.storeEmail)}.`) +
        spacer(32),
    ],
  });

  const text = [
    `Welcome, ${data.customerName}`,
    ``,
    `Your ${data.storeName} account is ready.`,
    ``,
    `${data.storeName} · ${data.storeEmail}`,
  ].join('\n');

  return { subject: subjectSafe(`Welcome to ${data.storeName}`), html, text };
}

/**
 * The verification code.
 *
 * Deliberately the plainest template here: no offers, no product photography,
 * one number shown large. A code email that looks like a promotion gets
 * filtered, and the only thing the reader wants is six digits they can retype.
 */
export function emailVerificationCode(
  data: {
    storeName: string;
    storeEmail: string;
    code: string;
    expiresInMinutes: number;
  },
  brand?: EmailBrand,
): RenderedEmail {
  const e = escapeHtml;
  const store = resolveBrand(data, brand);

  const html = shell({
    brand: store,
    title: 'Confirm your email',
    preheader: `${data.code} is your verification code. It expires in ${data.expiresInMinutes} minutes.`,
    sections: [
      openCard(store) +
        eyebrow('Verify your email') +
        spacer(10) +
        h1('Confirm your email') +
        spacer(14) +
        lede(`Enter this code to finish creating your ${e(store.storeName)} account.`) +
        spacer(24) +
        codeBlock(data.code) +
        spacer(18) +
        paragraph(`It expires in ${data.expiresInMinutes} minutes.`) +
        spacer(20) +
        divider() +
        spacer(20) +
        small(
          'If you did not ask for this, ignore this email — no account is created until the code is entered.',
        ) +
        spacer(32),
    ],
  });

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

  return {
    subject: subjectSafe(`${data.code} is your ${data.storeName} verification code`),
    html,
    text,
  };
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
export function storeSetup(
  data: {
    storeName: string;
    ownerName: string;
    adminUrl: string;
    storefrontUrl: string;
    platformName: string;
    supportEmail: string;
    email: string;
  },
  brand?: EmailBrand,
): RenderedEmail {
  const e = escapeHtml;
  const store = resolveBrand(
    { storeName: data.storeName, storeEmail: data.supportEmail },
    brand,
  );

  const steps: [string, string][] = [
    [
      'Set up payments',
      'Connect your own payment account, or switch on cash on delivery. Until one is active, shoppers cannot complete checkout.',
    ],
    ['Add your branding', 'Upload a logo, choose your colours and pick a background.'],
    ['Add products', 'With photos — a catalogue without images does not sell.'],
    ['Set delivery charges', 'Shipping zones and rates for where you deliver.'],
    ['Publish', 'Your storefront stays private until you turn it on in Settings.'],
  ];

  const stepRows = steps
    .map(
      ([title, detail], index) => `
      <tr>
        <td width="28" valign="top" style="width:28px;padding:${index === 0 ? '0' : '16px'} 12px 0 0;font-family:${MONO};font-size:14px;line-height:22px;mso-line-height-rule:exactly;font-weight:700;color:${INK.MUTED};">${index + 1}</td>
        <td valign="top" class="e-body" style="padding:${index === 0 ? '0' : '16px'} 0 0 0;font-family:${SANS};font-size:15px;line-height:22px;mso-line-height-rule:exactly;font-weight:400;color:${INK.BODY};">
          <span class="e-strong" style="font-weight:700;color:${INK.STRONG};">${e(title)}.</span> ${e(detail)}
        </td>
      </tr>`,
    )
    .join('');

  const html = shell({
    brand: store,
    title: `${data.storeName} is ready`,
    preheader: `Your store has been created. Here is where your admin lives.`,
    sections: [
      openCard(store) +
        eyebrow(data.platformName) +
        spacer(10) +
        h1(`${data.storeName} is ready`) +
        spacer(14) +
        lede(
          `Hello ${e(data.ownerName)} — your store has been created and you are its owner.`,
        ) +
        cta('Open your admin', data.adminUrl, store.brandColor) +
        spacer(24) +
        paragraph(
          `Sign in with <strong class="e-strong" style="color:${INK.STRONG};">${e(data.email)}</strong> using the password chosen when your store was set up.`,
        ) +
        spacer(10) +
        small(`Your storefront: ${e(data.storefrontUrl)}`) +
        spacer(32),

      spacer(28) +
        h2('Five things to do first') +
        spacer(16) +
        `<tr><td class="sm-px" style="padding:0 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${stepRows}</table></td></tr>` +
        spacer(28) +
        divider() +
        spacer(20) +
        small(`Questions? Reply to this email or write to ${e(data.supportEmail)}.`) +
        spacer(32),
    ],
    footerNote: e(data.platformName),
  });

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

  return {
    subject: subjectSafe(`${data.storeName} is ready — here is your admin`),
    html,
    text,
  };
}

/**
 * The password-reset code.
 *
 * Deliberately near-identical to the verification code email, and deliberately
 * a *different* message: telling someone "confirm your email" when they asked
 * to reset a password reads as the wrong email arriving, and is exactly when a
 * cautious person decides they have been phished.
 */
export function passwordResetCode(
  data: {
    storeName: string;
    storeEmail: string;
    code: string;
    expiresInMinutes: number;
  },
  brand?: EmailBrand,
): RenderedEmail {
  const e = escapeHtml;
  const store = resolveBrand(data, brand);

  const html = shell({
    brand: store,
    title: 'Reset your password',
    preheader: `${data.code} is your reset code. It expires in ${data.expiresInMinutes} minutes.`,
    sections: [
      openCard(store) +
        eyebrow('Password reset') +
        spacer(10) +
        h1('Reset your password') +
        spacer(14) +
        lede(`Enter this code on ${e(store.storeName)} to choose a new password.`) +
        spacer(24) +
        codeBlock(data.code) +
        spacer(18) +
        paragraph(`It expires in ${data.expiresInMinutes} minutes.`) +
        spacer(20) +
        divider() +
        spacer(20) +
        small(
          'If you did not ask for this, ignore this email — your password has not changed.',
        ) +
        spacer(32),
    ],
  });

  const text = [
    `Reset your password`,
    ``,
    `Enter this code on ${data.storeName} to choose a new password:`,
    ``,
    `    ${data.code}`,
    ``,
    `It expires in ${data.expiresInMinutes} minutes.`,
    `If you did not ask for this, ignore this email - your password has not changed.`,
    ``,
    `${data.storeName} · ${data.storeEmail}`,
  ].join('\n');

  return {
    subject: subjectSafe(`${data.code} is your ${data.storeName} password reset code`),
    html,
    text,
  };
}

/**
 * Confirms a storefront newsletter signup.
 *
 * Says how to get off the list, in both the HTML and the text part. There is no
 * one-click unsubscribe link yet — that needs a signed token and a public route
 * to land on — and a list with no stated way out is the part of this that would
 * be wrong to ship silently. Replying to the store's own address works today,
 * so that is what it offers.
 */
export function newsletterWelcome(
  data: { storeName: string; storeEmail: string; alreadySubscribed: boolean },
  brand?: EmailBrand,
): RenderedEmail {
  const e = escapeHtml;
  const store = resolveBrand(data, brand);

  const opening = data.alreadySubscribed
    ? `You are already on the ${data.storeName} list — nothing has changed, and you will not get this twice.`
    : `You will hear from ${data.storeName} when something new arrives. No more than that.`;

  const html = shell({
    brand: store,
    title: `You are on the ${data.storeName} list`,
    preheader: opening,
    sections: [
      openCard(store) +
        eyebrow('Mailing list') +
        spacer(10) +
        h1('You are on the list') +
        spacer(14) +
        lede(e(opening)) +
        cta('Visit the shop', store.storefrontUrl ?? null, store.brandColor) +
        spacer(28) +
        divider() +
        spacer(20) +
        // One contiguous string: a test matches this phrase, and a line break
        // inside the template literal would put a newline through the middle
        // of it.
        small('Want off it? Reply to this email and the store will take you off.') +
        spacer(32),
    ],
  });

  const text = [
    `You are on the list`,
    ``,
    opening,
    ``,
    `Want off it? Reply to this email and the store will take you off.`,
    ``,
    `${data.storeName} · ${data.storeEmail}`,
  ].join('\n');

  return { subject: subjectSafe(`You are on the ${data.storeName} list`), html, text };
}

/**
 * Tells someone an account has been made for them at a store.
 *
 * Carries no password, deliberately. `deliverEmail` stores the rendered body so
 * a failed send can be replayed, which is right for a receipt and wrong for a
 * credential: unlike the OTP codes — bounded by a ten-minute expiry and cleared
 * once spent — a staff password has no expiry, so mailing it would leave a
 * working credential sitting in the notifications table indefinitely, readable
 * by anyone who can open that screen.
 *
 * The one-time password is shown to the administrator instead, once, at the
 * moment they create the account, and passed on by them.
 */
export function staffInvited(
  data: {
    storeName: string;
    storeEmail: string;
    firstName: string;
    role: string;
    signInUrl: string;
  },
  brand?: EmailBrand,
): RenderedEmail {
  const e = escapeHtml;
  const store = resolveBrand(data, brand);

  const html = shell({
    brand: store,
    title: `Your ${data.storeName} account`,
    preheader: `An account has been created for you at ${data.storeName}.`,
    sections: [
      openCard(store) +
        eyebrow('Staff access') +
        spacer(10) +
        h1(`You have access to ${data.storeName}`) +
        spacer(14) +
        lede(
          `Hello ${e(data.firstName)} — an account has been created for you as <strong class="e-strong" style="color:${INK.STRONG};">${e(data.role)}</strong>.`,
        ) +
        cta('Sign in', data.signInUrl, store.brandColor) +
        spacer(24) +
        paragraph(`Use this email address to sign in at ${e(data.signInUrl)}.`) +
        spacer(12) +
        // One contiguous string: a test matches "not sent by email", and the
        // same test refuses any "password:" label anywhere in the document.
        paragraph('Your administrator will give you the password separately — it is deliberately not sent by email.') +
        spacer(28) +
        divider() +
        spacer(20) +
        small(`Questions? Reply to this email or write to ${e(store.storeEmail)}.`) +
        spacer(32),
    ],
  });

  const text = [
    `You have access to ${data.storeName}`,
    ``,
    `Hello ${data.firstName} - an account has been created for you as ${data.role}.`,
    ``,
    `Sign in at ${data.signInUrl} using this email address.`,
    `Your administrator will give you the password separately - it is`,
    `deliberately not sent by email.`,
    ``,
    `${data.storeName} · ${data.storeEmail}`,
  ].join('\n');

  return { subject: subjectSafe(`Your ${data.storeName} account`), html, text };
}
