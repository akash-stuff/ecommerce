import PDFDocument from 'pdfkit';
import type { InvoiceData, InvoiceParty } from './invoice-data';

/**
 * Draws an invoice as a PDF.
 *
 * A PDF rather than an HTML page the shopper is told to print: "download your
 * invoice" has to produce a file that can be forwarded to an accountant,
 * attached to a claim and opened in five years. A print stylesheet produces
 * whatever the browser felt like that day, with the site's header on it.
 *
 * Nothing is fetched while rendering. In particular the store's logo is *not*
 * embedded: doing that would mean the server making an HTTP request to a URL
 * held in the database, which is a request-forgery primitive pointed at the
 * inside of our own network. The business name in type is the same information
 * and costs nothing.
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
  const top = MARGIN;

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(16);
  doc.text(data.seller.name, MARGIN, top, { width: 300 });

  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  for (const line of data.seller.lines) {
    doc.text(line, MARGIN, doc.y, { width: 300 });
  }

  const identity = [
    data.seller.gstin ? `GSTIN ${data.seller.gstin}` : null,
    data.seller.pan ? `PAN ${data.seller.pan}` : null,
  ].filter(Boolean) as string[];

  if (identity.length > 0) {
    doc.moveDown(0.3);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9);
    doc.text(identity.join('   ·   '), MARGIN, doc.y, { width: 300 });
  }

  const contact = [data.seller.email, data.seller.phone].filter(Boolean) as string[];
  if (contact.length > 0) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(contact.join('   ·   '), MARGIN, doc.y, { width: 300 });
  }

  // Where the left column ended, kept before the cursor is moved into the
  // right one — otherwise a tall address block would be written over.
  const sellerBottom = doc.y;

  // The title block, right-aligned and drawn from the same top edge as the
  // seller block rather than after it, so the two sit side by side.
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(18);
  doc.text(data.isPaid ? 'TAX INVOICE' : 'INVOICE', RIGHT - 220, top, {
    width: 220,
    align: 'right',
  });

  if (!data.isPaid) {
    doc.font('Helvetica').fontSize(8).fillColor(MUTED);
    doc.text('Payment pending', RIGHT - 220, doc.y, { width: 220, align: 'right' });
  }

  doc.moveDown(0.4);
  const rows: [string, string][] = [
    ['Invoice no.', data.invoiceNumber],
    ['Invoice date', formatDate(data.issuedAt)],
    ['Order no.', data.orderNumber],
    ['Order date', formatDate(data.placedAt)],
  ];
  if (data.paymentMethod) rows.push(['Payment', data.paymentMethod]);

  for (const [label, value] of rows) {
    const y = doc.y;
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(label, RIGHT - 220, y, { width: 100, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
    doc.text(value, RIGHT - 115, y, { width: 115, align: 'right' });
  }

  const y = Math.max(doc.y, sellerBottom) + 12;
  rule(doc, y);
  doc.y = y + 14;
}

function parties(doc: Doc, data: InvoiceData): void {
  const top = doc.y;
  const width = (RIGHT - MARGIN - 24) / 2;

  party(doc, 'Billed to', data.billTo, MARGIN, top, width);
  party(doc, 'Delivered to', data.shipTo, MARGIN + width + 24, top, width);

  // Both columns start at the same y and one may be taller, so the cursor is
  // put below whichever won rather than below whichever was drawn last.
  doc.y = Math.max(doc.y, top) + 6;
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
  let y = startY;
  y = tableHead(doc, y);

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
      y = tableHead(doc, MARGIN);
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

function tableHead(doc: Doc, y: number): number {
  doc.rect(MARGIN, y, RIGHT - MARGIN, 20).fill(PANEL);
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

  y += 4;
  doc.strokeColor(RULE).lineWidth(1);
  doc.moveTo(x, y).lineTo(RIGHT, y).stroke();
  y += 8;

  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK);
  doc.text('Total', x, y, { width: width - 110 });
  doc.text(money(data.grandTotal), x + width - 110, y, { width: 110, align: 'right' });

  doc.y = y + 26;
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
