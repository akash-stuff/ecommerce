/**
 * Renders every transactional email to disk so it can be looked at.
 *
 *     npx ts-node test/preview-emails.ts [outDir]
 *
 * Not a test — nothing here asserts. It exists because an email is a visual
 * artefact and the only honest way to review one is to open it: a unit test can
 * prove a value is escaped, but not that the receipt is readable, that the
 * total does not collide with the column beside it, or that a long store name
 * pushes the logo off the row.
 *
 * The fixtures are deliberately awkward rather than tidy — a long store name, a
 * three-line product title, a variant, a discount, a two-line address — because
 * a design that only survives short strings has not been tested.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  customerWelcome,
  emailVerificationCode,
  newsletterWelcome,
  orderConfirmation,
  orderStatusChanged,
  passwordResetCode,
  staffInvited,
  storeSetup,
  type EmailBrand,
  type OrderEmailData,
} from '../src/notifications/templates';

const outDir = process.argv[2] ?? join(__dirname, '..', '.email-preview');
mkdirSync(outDir, { recursive: true });

/** A store that has uploaded a logo and chosen a colour. */
const branded: EmailBrand = {
  storeName: 'Northwind Trading Company',
  storeEmail: 'help@northwind.example',
  brandColor: '#166534',
  logoUrl: 'https://dummyimage.com/240x64/166534/ffffff.png&text=NORTHWIND',
  storefrontUrl: 'https://northwind.example',
};

/** A store on day one: no logo, default colour, no domain connected yet. */
const bare: EmailBrand = {
  storeName: 'Voltway',
  storeEmail: 'hello@voltway.example',
  brandColor: '#1D4ED8',
  logoUrl: null,
  storefrontUrl: null,
};

const order = (over: Partial<OrderEmailData> = {}): OrderEmailData => ({
  storeName: branded.storeName,
  storeEmail: branded.storeEmail,
  brandColor: branded.brandColor,
  orderNumber: 'ORD-20260829-8F31C2',
  customerName: 'Asha Rao',
  currency: 'INR',
  items: [
    {
      name: 'Hand-thrown stoneware mug, glazed in ash',
      variantName: 'Large · Slate',
      quantity: 2,
      lineTotal: '2598.00',
    },
    { name: 'Linen tea towel', variantName: null, quantity: 1, lineTotal: '499.00' },
    {
      name: 'A deliberately very long product name that has to wrap onto a second and probably a third line',
      variantName: 'One size',
      quantity: 1,
      lineTotal: '12000.00',
    },
  ],
  subtotal: '15097.00',
  discountTotal: '1509.70',
  taxTotal: '2445.71',
  shippingTotal: '0.00',
  grandTotal: '16033.01',
  shippingAddress: {
    fullName: 'Asha Rao',
    line1: 'Flat 4B, Sea Breeze Apartments',
    line2: '12 Marine Drive',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400001',
    country: 'IN',
  },
  paymentMethod: 'Cash on delivery',
  ...over,
});

const cases: { name: string; subject: string; html: string; text: string }[] = [];

const add = (name: string, mail: { subject: string; html: string; text: string }) =>
  cases.push({ name, ...mail });

add('01-order-confirmation', orderConfirmation(order(), branded));
add(
  '02-order-confirmation-minimal',
  orderConfirmation(
    order({
      items: [{ name: 'Linen tea towel', variantName: null, quantity: 1, lineTotal: '499.00' }],
      discountTotal: '0.00',
      shippingTotal: '99.00',
      subtotal: '499.00',
      taxTotal: '89.82',
      grandTotal: '687.82',
      shippingAddress: { ...order().shippingAddress, line2: null },
    }),
    bare,
  ),
);
add(
  '03-order-shipped',
  orderStatusChanged(
    {
      storeName: branded.storeName,
      storeEmail: branded.storeEmail,
      orderNumber: 'ORD-20260829-8F31C2',
      customerName: 'Asha Rao',
      status: 'SHIPPED',
      tracking: {
        courier: 'Delhivery',
        consignment: 'DL0293841772IN',
        url: 'https://www.delhivery.com/track/package/DL0293841772IN',
      },
    },
    branded,
  ),
);
add(
  '04-order-cancelled',
  orderStatusChanged(
    {
      storeName: bare.storeName,
      storeEmail: bare.storeEmail,
      orderNumber: 'ORD-20260829-8F31C2',
      customerName: 'Asha Rao',
      status: 'CANCELLED',
      reason: 'The last one was damaged in the warehouse.',
    },
    bare,
  ),
);
add(
  '05-customer-welcome',
  customerWelcome(
    { storeName: branded.storeName, storeEmail: branded.storeEmail, customerName: 'Asha' },
    branded,
  ),
);
add(
  '06-verification-code',
  emailVerificationCode(
    {
      storeName: branded.storeName,
      storeEmail: branded.storeEmail,
      code: '408215',
      expiresInMinutes: 10,
    },
    branded,
  ),
);
add(
  '07-password-reset-code',
  passwordResetCode(
    {
      storeName: bare.storeName,
      storeEmail: bare.storeEmail,
      code: '019473',
      expiresInMinutes: 10,
    },
    bare,
  ),
);
add(
  '08-store-setup',
  storeSetup(
    {
      storeName: 'Northwind Trading Company',
      ownerName: 'Priya',
      adminUrl: 'https://admin.everystore.example/login',
      storefrontUrl: 'https://northwind.everystore.example',
      platformName: 'everystore.example',
      supportEmail: 'support@everystore.example',
      email: 'priya@northwind.example',
    },
    branded,
  ),
);
add(
  '09-newsletter-welcome',
  newsletterWelcome(
    { storeName: branded.storeName, storeEmail: branded.storeEmail, alreadySubscribed: false },
    branded,
  ),
);
add(
  '10-staff-invited',
  staffInvited(
    {
      storeName: branded.storeName,
      storeEmail: branded.storeEmail,
      firstName: 'Rohit',
      role: 'Administrator',
      signInUrl: 'https://admin.everystore.example/login',
    },
    branded,
  ),
);

for (const item of cases) {
  writeFileSync(join(outDir, `${item.name}.html`), item.html, 'utf8');
  writeFileSync(join(outDir, `${item.name}.txt`), `${item.subject}\n\n${item.text}`, 'utf8');
}

/**
 * One page listing all of them side by side, each in its own iframe.
 *
 * An iframe per email rather than the markup inlined into one document: these
 * are whole HTML documents with their own <head>, and pasting ten of them into
 * one page would let the last one's styles reach the first one's markup — the
 * opposite of a faithful preview.
 */
const index = `<!doctype html>
<meta charset="utf-8">
<title>Email preview</title>
<style>
  body { font: 14px/1.5 -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: #f3f4f6; color: #111827 }
  header { padding: 20px 24px; background: #fff; border-bottom: 1px solid #e5e7eb; position: sticky; top: 0; z-index: 2 }
  h1 { margin: 0; font-size: 16px }
  p { margin: 4px 0 0; color: #6b7280; font-size: 13px }
  .grid { display: grid; gap: 24px; padding: 24px; grid-template-columns: repeat(auto-fill, minmax(660px, 1fr)) }
  section { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden }
  h2 { margin: 0; padding: 12px 16px; font-size: 13px; border-bottom: 1px solid #e5e7eb; background: #fafafa }
  h2 span { display: block; font-weight: 400; color: #6b7280; margin-top: 2px }
  iframe { width: 100%; height: 900px; border: 0; display: block }
</style>
<header>
  <h1>Transactional email preview</h1>
  <p>${cases.length} templates. Each frame is the real HTML the mailer sends.</p>
</header>
<div class="grid">
${cases
  .map(
    (item) => `  <section>
    <h2>${item.name}<span>${item.subject.replace(/</g, '&lt;')}</span></h2>
    <iframe src="./${item.name}.html" title="${item.name}"></iframe>
  </section>`,
  )
  .join('\n')}
</div>`;

writeFileSync(join(outDir, 'index.html'), index, 'utf8');

console.log(`Wrote ${cases.length} emails to ${outDir}`);
console.log(`Open ${join(outDir, 'index.html')}`);
