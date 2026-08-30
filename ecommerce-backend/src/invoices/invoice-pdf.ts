import PDFDocument from 'pdfkit';
import { DEFAULT_BRAND, inkOn, mix, safeHex } from '../common/colour';
import { BRAND_DEFAULTS } from '../theme/brand-defaults';
import type { InvoiceBrand, InvoiceData, InvoiceParty } from './invoice-data';

/**
 * Draws an invoice as a PDF.
 *
 * A PDF rather than an HTML page the shopper is told to print: "download your
 * invoice" has to produce a file that can be forwarded to an accountant,
 * attached to a claim and opened in five years. A print stylesheet produces
 * whatever the browser felt like that day, with the site's header on it.
 *
 * Nothing is fetched while rendering. The store's logo arrives as *bytes*,
 * already loaded and checked by `store-logo.ts`, and this file has no idea a
 * URL was ever involved. That split is deliberate: embedding `theme.logoUrl`
 * here would mean the renderer making an HTTP request to an address held in the
 * database, which is a request-forgery primitive aimed at the inside of our own
 * network. Keeping the fetch out of the renderer is what makes it reviewable.
 *
 * ## Two colours, both the tenant's
 *
 * A document set in one hue reads as a template with a colour dropped into it.
 * The primary carries the heading band and the totals rule; the secondary marks
 * the grand total and the accent line under the logo. Ink that sits on either
 * is computed rather than assumed — a shopkeeper may pick a pale yellow, and an
 * invoice whose total cannot be read is not an invoice.
 */

/** A4 at 72dpi, which is what pdfkit's default user space is. */
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 42;
const RIGHT = PAGE.width - MARGIN;
const BOTTOM = PAGE.height - MARGIN - 30;

const INK = '#111827';
const MUTED = '#6b7280';
const RULE = '#d1d5db';
const PANEL = '#f3f4f6';

/** How tall the coloured band across the top of the first page is. */
const BAND_HEIGHT = 96;

/**
 * The store's two colours, defaulted and validated.
 *
 * A stored value never passed through the API's validation — a seed, a
 * migration, a hand edit — so it is checked here rather than trusted, exactly
 * as the email layer does.
 */
interface Palette {
  primary: string;
  secondary: string;
  onPrimary: string;
  wash: string;
}

function paletteOf(brand?: InvoiceBrand): Palette {
  const primary = safeHex(brand?.primary ?? DEFAULT_BRAND);
  const secondary = safeHex(brand?.secondary ?? BRAND_DEFAULTS.SECONDARY);

  return {
    primary,
    secondary,
    // White on a forest green, near-black on a pale yellow — decided, not assumed.
    onPrimary: inkOn(primary),
    /** A barely-there tint of the primary, for the panel behind the totals. */
    wash: mix('#FFFFFF', primary, 0.06),
  };
}

const COLUMNS = {
  index: { x: MARGIN, width: 22 },
  description: { x: MARGIN + 24, width: 210 },
  quantity: { x: MARGIN + 240, width: 34 },
  rate: { x: MARGIN + 278, width: 74 },
  tax: { x: MARGIN + 356, width: 64 },
  amount: { x: MARGIN + 424, width: RIGHT - (MARGIN + 424) },
};

export function renderInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      // Pages are held open so the footer can be stamped on every one of them
      // once the total page count is known.
      bufferPages: true,
      info: {
        Title: `Invoice ${data.invoiceNumber}`,
        Author: data.seller.name,
        Subject: `Order ${data.orderNumber}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      draw(doc, data);
      doc.end();
    } catch (error) {
      reject(error as Error);
    }
  });
}

type Doc = PDFKit.PDFDocument;

function draw(doc: Doc, data: InvoiceData): void {
  const money = (value: string) => formatMoney(value, data.currency);

  header(doc, data);
  parties(doc, data);
  const startY = doc.y + 8;
  const endY = table(doc, data, money, startY);
  totals(doc, data, money, endY);
  footer(doc, data);
}

// --- Sections ----------------------------------------------------------------

function header(doc: Doc, data: InvoiceData): void {
  const palette = paletteOf(data.brand);

  /**
   * A full-bleed band in the store's primary.
   *
   * Drawn to the page edges rather than inset, because an inset panel reads as
   * a box someone put on a page and a bleed reads as stationery. It is the one
   * large area of colour in the document; everything below it is ink on paper.
   */
  doc.rect(0, 0, PAGE.width, BAND_HEIGHT).fill(palette.primary);

  // The secondary, as a hairline under the band. Two colours meeting is what
  // stops the band looking like a single flat slab.
  doc.rect(0, BAND_HEIGHT, PAGE.width, 3).fill(palette.secondary);

  const bandText = palette.onPrimary;
  let nameTop = MARGIN - 8;

  /**
   * The mark, when the store has one that could be loaded.
   *
   * Sized by height and left to find its own width, because the aspect ratio is
   * the shopkeeper's and asserting one would squash a square logo or stretch a
   * wide one. `fit` bounds both sides so a very wide mark cannot run under the
   * invoice title on the right.
   */
  if (data.brand?.logo) {
    try {
      doc.image(data.brand.logo, MARGIN, MARGIN - 10, { fit: [170, 44] });
      nameTop = MARGIN + 40;
    } catch {
      // Bad bytes that got past the type check. The name below is the fallback,
      // and an invoice must not fail over a logo.
      nameTop = MARGIN - 8;
    }
  }

  doc.fillColor(bandText).font('Helvetica-Bold').fontSize(data.brand?.logo ? 11 : 17);
  doc.text(data.seller.name, MARGIN, nameTop, { width: 300 });

  /**
   * The title, on the band and opposite the mark.
   *
   * "TAX INVOICE" only when the order is paid: an unpaid one is a request for
   * money, and calling it a tax invoice would be a false statement on a
   * document somebody files.
   */
  doc.fillColor(bandText).font('Helvetica-Bold').fontSize(20);
  doc.text(data.isPaid ? 'TAX INVOICE' : 'INVOICE', RIGHT - 240, MARGIN - 6, {
    width: 240,
    align: 'right',
    characterSpacing: 1.2,
  });

  doc.font('Helvetica').fontSize(9).fillColor(bandText);
  doc.text(
    data.isPaid ? data.invoiceNumber : `${data.invoiceNumber} · payment pending`,
    RIGHT - 240,
    doc.y + 2,
    { width: 240, align: 'right' },
  );

  // Below the band: the seller's details in ink, where they are readable
  // whatever colour the band happens to be.
  let y = BAND_HEIGHT + 22;

  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  for (const line of data.seller.lines) {
    doc.text(line, MARGIN, y, { width: 300 });
    y = doc.y;
  }

  const identity = [
    data.seller.gstin ? `GSTIN ${data.seller.gstin}` : null,
    data.seller.pan ? `PAN ${data.seller.pan}` : null,
  ].filter(Boolean) as string[];

  if (identity.length > 0) {
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9);
    doc.text(identity.join('   ·   '), MARGIN, y + 4, { width: 300 });
    y = doc.y;
  }

  const contact = [data.seller.email, data.seller.phone].filter(Boolean) as string[];
  if (contact.length > 0) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(contact.join('   ·   '), MARGIN, y, { width: 300 });
  }

  const sellerBottom = doc.y;

  // The dated facts, right-aligned against the seller block.
  const rows: [string, string][] = [
    ['Invoice no.', data.invoiceNumber],
    ['Invoice date', formatDate(data.issuedAt)],
    ['Order no.', data.orderNumber],
    ['Order date', formatDate(data.placedAt)],
  ];
  if (data.paymentMethod) rows.push(['Payment', data.paymentMethod]);

  let rowY = BAND_HEIGHT + 22;
  for (const [label, value] of rows) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(label, RIGHT - 240, rowY, { width: 110, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
    doc.text(value, RIGHT - 125, rowY, { width: 125, align: 'right' });
    rowY = doc.y;
  }

  const bottom = Math.max(rowY, sellerBottom) + 14;
  doc.strokeColor(RULE).lineWidth(1);
  doc.moveTo(MARGIN, bottom).lineTo(RIGHT, bottom).stroke();
  doc.y = bottom + 16;
}

function parties(doc: Doc, data: InvoiceData): void {
  const top = doc.y;
  const width = (RIGHT - MARGIN - 24) / 2;

  /**
   * Each column's own bottom, captured as it is drawn.
   *
   * This used to read `Math.max(doc.y, top)`, which compares the *second*
   * column's bottom against the block's start — the start always loses, so the
   * result was "below whichever was drawn last" no matter what the comment
   * claimed. The billing column is the taller of the two whenever a customer
   * has an email and a phone number on file, and the items table was drawn
   * straight through the bottom of it.
   */
  party(doc, 'Billed to', data.billTo, MARGIN, top, width);
  const billBottom = doc.y;

  party(doc, 'Delivered to', data.shipTo, MARGIN + width + 24, top, width);
  const shipBottom = doc.y;

  doc.y = Math.max(billBottom, shipBottom) + 20;
}

function party(
  doc: Doc,
  heading: string,
  value: InvoiceParty,
  x: number,
  y: number,
  width: number,
): void {
  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);
  doc.text(heading.toUpperCase(), x, y, { width, characterSpacing: 0.6 });

  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK);
  doc.text(value.name, x, doc.y + 3, { width });

  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  for (const line of value.lines) {
    doc.text(line, x, doc.y, { width });
  }

  const extra = [
    value.gstin ? `GSTIN ${value.gstin}` : null,
    value.email,
    value.phone,
  ].filter(Boolean) as string[];

  for (const line of extra) {
    doc.text(line, x, doc.y, { width });
  }
}

/** Returns the y the table finished at. */
function table(
  doc: Doc,
  data: InvoiceData,
  money: (value: string) => string,
  startY: number,
): number {
  const palette = paletteOf(data.brand);

  let y = startY;
  y = tableHead(doc, y, palette);

  data.lines.forEach((line, index) => {
    const metaHeight = line.meta ? 11 : 0;
    const nameHeight = doc
      .font('Helvetica')
      .fontSize(9)
      .heightOfString(line.description, { width: COLUMNS.description.width });
    const height = Math.max(nameHeight + metaHeight, 14) + 10;

    // A new page keeps the column headings, so a second sheet is readable on
    // its own rather than being a list of numbers under nothing.
    if (y + height > BOTTOM) {
      doc.addPage();
      y = tableHead(doc, MARGIN, palette);
    }

    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(String(index + 1), COLUMNS.index.x, y, { width: COLUMNS.index.width });

    doc.fillColor(INK);
    doc.text(line.description, COLUMNS.description.x, y, {
      width: COLUMNS.description.width,
    });
    if (line.meta) {
      doc.fontSize(8).fillColor(MUTED);
      doc.text(line.meta, COLUMNS.description.x, doc.y, {
        width: COLUMNS.description.width,
      });
      doc.fontSize(9);
    }

    doc.fillColor(INK).font('Helvetica');
    right(doc, String(line.quantity), COLUMNS.quantity, y);
    right(doc, money(line.unitPrice), COLUMNS.rate, y);
    right(doc, money(line.tax), COLUMNS.tax, y);
    doc.font('Helvetica-Bold');
    right(doc, money(line.lineTotal), COLUMNS.amount, y);

    y += height;
    doc.strokeColor('#eceef1').lineWidth(0.5);
    doc.moveTo(MARGIN, y - 5).lineTo(RIGHT, y - 5).stroke();
  });

  return y;
}

function tableHead(doc: Doc, y: number, palette: Palette): number {
  // The store's colour at 6%, not a neutral grey: the column headings should
  // belong to the same document as the band above them.
  doc.rect(MARGIN, y, RIGHT - MARGIN, 20).fill(palette.wash);
  // A hairline of the primary under the headings, so the table has a top edge
  // that is the brand rather than another grey.
  doc.rect(MARGIN, y + 20, RIGHT - MARGIN, 1).fill(palette.primary);
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8);

  const textY = y + 6;
  doc.text('#', COLUMNS.index.x + 4, textY, { width: COLUMNS.index.width });
  doc.text('DESCRIPTION', COLUMNS.description.x, textY, {
    width: COLUMNS.description.width,
  });
  right(doc, 'QTY', COLUMNS.quantity, textY);
  right(doc, 'RATE', COLUMNS.rate, textY);
  right(doc, 'TAX', COLUMNS.tax, textY);
  right(doc, 'AMOUNT', COLUMNS.amount, textY);

  return y + 28;
}

function totals(
  doc: Doc,
  data: InvoiceData,
  money: (value: string) => string,
  startY: number,
): void {
  const width = 230;
  const x = RIGHT - width;
  let y = startY + 6;

  const rows: [string, string][] = [['Subtotal', money(data.subtotal)]];

  if (Number(data.discountTotal) > 0) {
    rows.push([
      data.couponCode ? `Discount (${data.couponCode})` : 'Discount',
      `- ${money(data.discountTotal)}`,
    ]);
  }

  // Per-rate GST lines when the store is registered, one plain "Tax" line when
  // it is not. Printing "CGST" on an invoice from an unregistered shop would be
  // an untrue statement on a tax document.
  for (const line of data.taxLines) rows.push([line.label, money(line.amount)]);

  rows.push([
    'Shipping',
    Number(data.shippingTotal) === 0 ? 'Free' : money(data.shippingTotal),
  ]);

  // Nine rows of totals will not fit under a table that ended near the foot.
  if (y + rows.length * 15 + 46 > BOTTOM) {
    doc.addPage();
    y = MARGIN;
  }

  for (const [label, value] of rows) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(label, x, y, { width: width - 110 });
    doc.fillColor(INK);
    doc.text(value, x + width - 110, y, { width: 110, align: 'right' });
    y += 15;
  }

  const palette = paletteOf(data.brand);

  y += 4;
  // Ruled in the primary rather than in grey: this is the line that separates
  // the working from the answer, and it is worth the one stroke of colour.
  doc.strokeColor(palette.primary).lineWidth(1);
  doc.moveTo(x, y).lineTo(RIGHT, y).stroke();
  y += 8;

  /**
   * The grand total, on a tinted plate with a secondary edge.
   *
   * The one figure anybody looks for first, so it is the one thing given a
   * ground of its own. The plate is a wash of the primary and the edge is the
   * secondary — the two colours meeting again at the bottom of the page as they
   * did at the top, which is what makes the sheet read as one piece.
   */
  const plateHeight = 30;
  doc.rect(x, y - 6, width, plateHeight).fill(palette.wash);
  doc.rect(x, y - 6, 3, plateHeight).fill(palette.secondary);

  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK);
  doc.text('Total', x + 12, y + 2, { width: width - 122 });
  doc.text(money(data.grandTotal), x + width - 122, y + 2, { width: 110, align: 'right' });

  doc.y = y + plateHeight + 16;
}

function footer(doc: Doc, data: InvoiceData): void {
  if (data.notes) {
    if (doc.y + 60 > BOTTOM) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);
    doc.text('NOTES', MARGIN, doc.y, { characterSpacing: 0.6 });
    doc.font('Helvetica').fontSize(9).fillColor(INK);
    doc.text(data.notes, MARGIN, doc.y + 3, { width: 330 });
  }

  /**
   * Stamped on every page at the end, once the page count is known. Written
   * during the draw it would land only on the page the cursor happened to be
   * on, and a two-page invoice would have an unnumbered sheet.
   */
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    // A thin rule of the store's colour along the foot of every page, so a
    // second sheet is recognisably part of the same document.
    doc.rect(0, PAGE.height - 4, PAGE.width, 4).fill(paletteOf(data.brand).primary);

    doc.font('Helvetica').fontSize(8).fillColor(MUTED);
    doc.text(
      `${data.invoiceNumber}   ·   Computer generated; no signature required` +
        (range.count > 1 ? `   ·   Page ${i - range.start + 1} of ${range.count}` : ''),
      MARGIN,
      PAGE.height - MARGIN - 12,
      { width: RIGHT - MARGIN, align: 'center' },
    );
  }
}

// --- Helpers -----------------------------------------------------------------

function rule(doc: Doc, y: number): void {
  doc.strokeColor(RULE).lineWidth(1);
  doc.moveTo(MARGIN, y).lineTo(RIGHT, y).stroke();
}

function right(
  doc: Doc,
  text: string,
  column: { x: number; width: number },
  y: number,
): void {
  doc.text(text, column.x, y, { width: column.width, align: 'right' });
}

/**
 * Money, in a font that has no rupee sign.
 *
 * pdfkit's built-in faces are WinAnsi-encoded, so U+20B9 renders as a wrong
 * glyph or nothing at all. Embedding a Unicode TTF to print one character would
 * add a font file to the image for every store, most of which never issue an
 * INR invoice. "Rs." is what Indian invoices printed for decades and is
 * unambiguous; every other currency gets its ISO code, which is what an
 * accountant abroad would rather see than a symbol shared by five countries.
 */
export function formatMoney(value: string, currency: string): string {
  const amount = Number.parseFloat(value);
  // A hyphen, not an em dash: the built-in faces are WinAnsi and would print
  // the wrong glyph for one.
  if (Number.isNaN(amount)) return `${currency} -`;

  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return currency === 'INR' ? `Rs. ${formatted}` : `${currency} ${formatted}`;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(value);
}
