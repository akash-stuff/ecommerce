/**
 * Renders sample invoices to disk so they can be looked at.
 *
 *     npx ts-node test/preview-invoice.ts [outDir]
 *
 * Not a test — nothing here asserts. An invoice is a visual artefact and the
 * only honest way to review one is to open it: a unit test can prove the GST
 * split is right, not that the total is legible against the plate behind it or
 * that a long store name collides with the invoice title.
 *
 * Three fixtures, because the interesting failures are at the edges of the
 * palette: a dark brand where white type works, a pale brand where it does not,
 * and a store with no logo at all.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { renderInvoicePdf } from '../src/invoices/invoice-pdf';
import type { InvoiceData } from '../src/invoices/invoice-data';

const outDir = process.argv[2] ?? join(__dirname, '..', '.invoice-preview');
mkdirSync(outDir, { recursive: true });

/**
 * A PNG, built here rather than fetched.
 *
 * The preview must not reach the network — that is the whole point of the logo
 * arriving as bytes — so this writes a small opaque rectangle by hand. It is
 * enough to prove the mark is placed, sized and clipped correctly.
 */
function samplePng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const chunk = (type: string, body: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed) >>> 0);
    return Buffer.concat([length, typed, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const raw = Buffer.concat(
    Array.from({ length: height }, () =>
      Buffer.concat([
        Buffer.from([0]),
        Buffer.concat(Array.from({ length: width }, () => Buffer.from(rgb))),
      ]),
    ),
  );

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}

const base = (over: Partial<InvoiceData> = {}): InvoiceData => ({
  invoiceNumber: 'INV-ORD-20260829-8F31C2',
  orderNumber: 'ORD-20260829-8F31C2',
  issuedAt: new Date('2026-08-21T10:00:00Z'),
  placedAt: new Date('2026-08-21T10:00:00Z'),
  currency: 'INR',
  isPaid: true,
  paymentMethod: 'razorpay · upi',
  seller: {
    name: 'Northwind Trading Company Private Limited',
    lines: ['14 Residency Road', 'Bengaluru, Karnataka, 560025'],
    gstin: '29AAPFU0939F1ZV',
    pan: 'AAPFU0939F',
    email: 'billing@northwind.example',
    phone: '+91 80 4000 1234',
    state: 'Karnataka',
  },
  billTo: {
    name: 'Priya Raman',
    lines: ['22 Alwarpet Street', 'Chennai, Tamil Nadu, 600018', 'IN'],
    email: 'priya@example.com',
    phone: '+91 98400 11111',
    state: 'Tamil Nadu',
  },
  shipTo: {
    name: 'Priya Raman',
    lines: ['22 Alwarpet Street', 'Chennai, Tamil Nadu, 600018', 'IN'],
    state: 'Tamil Nadu',
  },
  lines: [
    {
      description: 'Hand-thrown stoneware mug, glazed in ash',
      meta: 'Large · Slate · SKU MUG-100',
      quantity: 2,
      unitPrice: '1299.00',
      discount: '0.00',
      tax: '467.64',
      lineTotal: '3065.64',
    },
    {
      description: 'A deliberately very long product name that has to wrap onto a second line',
      meta: 'One size · SKU LNG-001',
      quantity: 1,
      unitPrice: '12000.00',
      discount: '0.00',
      tax: '2160.00',
      lineTotal: '14160.00',
    },
    {
      description: 'Linen tea towel',
      meta: 'SKU TWL-004',
      quantity: 3,
      unitPrice: '499.00',
      discount: '0.00',
      tax: '269.46',
      lineTotal: '1766.46',
    },
  ],
  subtotal: '16095.00',
  discountTotal: '1609.50',
  taxLines: [{ label: 'IGST', amount: '2897.10' }],
  taxTotal: '2897.10',
  shippingTotal: '0.00',
  grandTotal: '17382.60',
  couponCode: 'WELCOME10',
  notes: 'Payment due on receipt. Bank: HDFC 00112233445, IFSC HDFC0000123.',
  ...over,
});

const cases: [string, InvoiceData][] = [
  [
    // The default: a dark green brand, amber secondary, with a logo.
    '01-branded-with-logo',
    base({
      brand: {
        primary: '#166534',
        secondary: '#F5A524',
        logo: samplePng(240, 64, [255, 255, 255]),
      },
    }),
  ],
  [
    /**
     * The case the contrast maths exists for. `#F5A524` is 2.04:1 on white, so
     * white type on this band would be unreadable — the ink must come out dark.
     */
    '02-pale-brand-no-logo',
    base({
      brand: { primary: '#F5A524', secondary: '#166534', logo: null },
      seller: { ...base().seller, name: 'Voltway' },
    }),
  ],
  [
    // No brand at all: the platform defaults, and an unpaid order.
    '03-unbranded-unpaid',
    base({ brand: undefined, isPaid: false, paymentMethod: 'Cash on delivery' }),
  ],
];

async function main(): Promise<void> {
  for (const [name, data] of cases) {
    const pdf = await renderInvoicePdf(data);
    writeFileSync(join(outDir, `${name}.pdf`), pdf);
    console.log(`${name}.pdf  ${pdf.length} bytes`);
  }
  console.log(`\nWrote ${cases.length} invoices to ${outDir}`);
}

void main();
