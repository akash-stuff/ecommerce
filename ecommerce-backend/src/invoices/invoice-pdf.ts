import PDFDocument from 'pdfkit';
import { DEFAULT_BRAND, mix, readableOn, safeHex } from '../common/colour';
import { BRAND_DEFAULTS } from '../theme/brand-defaults';
import type {
  InvoiceBrand,
  InvoiceData,
  InvoiceLine,
  InvoiceParty,
} from './invoice-data';

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
 * ## A light document, and two colours spent sparingly
 *
 * The page is white, the type is ink, and the store's primary and secondary
 * appear only as *rules, edges and washes* — a two-tone hairline under the
 * masthead, a bar down the side of each address block, the rule above the grand
 * total, the plate the total sits on. Never a filled area with type on it.
 *
 * This was tried the other way first: a 96pt band of the primary across the
 * head of the page and another along the foot. It read as heavy and dark, which
 * is the wrong register for a document somebody files with their accounts. A
 * letterhead is white; what marks it as somebody's is a logo and a line, not a
 * slab of colour. The band also fought the logo, which had to sit on a white
 * plate punched into it, and put two saturated colours immediately adjacent.
 *
 * The contrast question moves rather than going away: what a light document
 * needs is the opposite direction, the store's colour made dark enough to be
 * read *on paper*. That is `readableOn` from `common/colour`, which is the walk
 * the email buttons already did — reused rather than re-derived, because a
 * second contrast calculation is a second threshold that can drift.
 *
 * ## What is on the page
 *
 * Masthead, seller and invoice facts, the two addresses, the items, the totals
 * with the amount written out in words, then notes and a signature block that
 * sit down at the foot of the last sheet. The order is the one an accounts
 * clerk reads in, and the blocks that exist for compliance — place of supply,
 * the GST heads, the amount in words — are printed where such a person expects
 * to find them rather than wherever there happened to be room.
 */

/** A4 at 72dpi, which is what pdfkit's default user space is. */
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 44;
const RIGHT = PAGE.width - MARGIN;
/** The measure: everything on the page is laid out inside this width. */
const MEASURE = RIGHT - MARGIN;

/**
 * Kept clear at the foot of every page for the rule, the legal line and the
 * page number.
 *
 * Reserved rather than hoped for. The footer is stamped after the fact, once
 * the page count is known, and it will happily print on top of a table row that
 * ran too far — so no flowing content is allowed below this line.
 */
const FOOTER_BAND = 46;
const BOTTOM = PAGE.height - MARGIN - FOOTER_BAND;

const INK = '#111827';
/** Small letterspaced captions: darker than body grey so they hold at 7.5pt. */
const LABEL = '#4b5563';
const MUTED = '#6b7280';
/** Section dividers and panel borders. */
const RULE = '#e5e7eb';
/** Between table rows, where a full-strength rule would look like a grid. */
const HAIRLINE = '#f0f1f3';
/** A neutral fill, for the one panel that must not be branded. */
const PANEL = '#f4f5f7';

/**
 * The store's two colours, defaulted, validated and derived from.
 *
 * A stored value never passed through the API's validation — a seed, a
 * migration, a hand edit — so it is checked here rather than trusted, exactly
 * as the email layer does.
 */
interface Palette {
  primary: string;
  secondary: string;
  /**
   * The primary darkened until it reads as type on white.
   *
   * A shopkeeper may pick a pale yellow, and `PAID` set in it would be a
   * rumour. `readableOn` steps the lightness down until the contrast clears
   * 4.5:1 and gives up to ink if it cannot. It is measured against the tint
   * rather than against the paper, because that is the darker of the two
   * grounds this colour is ever set on — clear it and white is clear too.
   */
  strong: string;
  /** A barely-there tint, for plates and the table head. */
  wash: string;
  /** A stronger tint, for the one small badge that has to be noticed. */
  tint: string;
}

function paletteOf(brand?: InvoiceBrand): Palette {
  const primary = safeHex(brand?.primary ?? DEFAULT_BRAND);
  const secondary = safeHex(brand?.secondary ?? BRAND_DEFAULTS.SECONDARY);

  const tint = mix('#FFFFFF', primary, 0.12);

  return {
    primary,
    secondary,
    strong: readableOn(primary, tint),
    wash: mix('#FFFFFF', primary, 0.05),
    tint,
  };
}

/**
 * The items table, measured from the right.
 *
 * The money columns get the width they need for the longest figure they will
 * ever hold and the description takes what is left, rather than the other way
 * round: a wrapped product name costs one more line, a wrapped total is a
 * misread number.
 */
const COLUMNS = (() => {
  const gutter = 10;
  const amount = { x: RIGHT - 84, width: 84 };
  const tax = { x: amount.x - gutter - 66, width: 66 };
  const rate = { x: tax.x - gutter - 72, width: 72 };
  const quantity = { x: rate.x - gutter - 32, width: 32 };
  const index = { x: MARGIN, width: 18 };
  const description = {
    x: index.x + index.width + gutter,
    width: quantity.x - gutter - (index.x + index.width + gutter),
  };
  return { index, description, quantity, rate, tax, amount };
})();

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
  const palette = paletteOf(data.brand);
  const money = (value: string) => formatMoney(value, data.currency);

  masthead(doc, data, palette);
  details(doc, data);
  parties(doc, data, palette);
  const tableEnd = table(doc, data, palette, money);
  summary(doc, data, palette, money, tableEnd);
  closing(doc, data, palette);
  footer(doc, data, palette);
}

// --- Sections ----------------------------------------------------------------

/**
 * The store's mark on white, the document's name opposite it, and the two-tone
 * rule that closes the block.
 *
 * No band. A filled header in the tenant's colour was the first attempt and it
 * read as dark and heavy — see the note at the top of this file. What identifies
 * the page instead is the logo itself, at its own size and in its own colours,
 * which is what a letterhead does.
 */
function masthead(doc: Doc, data: InvoiceData, palette: Palette): void {
  const top = MARGIN;
  const logoBox: [number, number] = [156, 40];
  let logoDrawn = false;

  if (data.brand?.logo) {
    try {
      /**
       * Sized by height and left to find its own width: the aspect ratio is the
       * shopkeeper's, and asserting one would squash a square mark or stretch a
       * wide one. `fit` bounds both sides so a very wide logo cannot run under
       * the title on the right.
       *
       * On white, so a dark logo — which most are — is legible. That is the
       * other half of why the band went.
       */
      doc.image(data.brand.logo, MARGIN, top, { fit: logoBox });
      logoDrawn = true;
    } catch {
      // Bad bytes that got past the type check. The name below is the fallback,
      // and an invoice must not fail over a logo.
      logoDrawn = false;
    }
  }

  /**
   * The store's name: a small caption under the mark, or the wordmark itself
   * when there is none.
   *
   * The caption clears the whole `fit` box rather than the image — pdfkit does
   * not report the height it actually drew, and guessing low would print the
   * name through the bottom of a tall logo. A short logo buys a few points of
   * air instead, which is the harmless direction to be wrong in.
   */
  if (logoDrawn) {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(LABEL);
    doc.text(data.seller.name, MARGIN, top + logoBox[1] + 8, {
      width: 250,
      characterSpacing: 0.3,
    });
  } else {
    doc.font('Helvetica-Bold').fontSize(17).fillColor(INK);
    doc.text(data.seller.name, MARGIN, top + 2, { width: 262 });
  }
  const leftBottom = doc.y;

  /**
   * The title, in ink rather than on colour.
   *
   * "TAX INVOICE" only when the order is paid: an unpaid one is a request for
   * money, and calling it a tax invoice would be a false statement on a
   * document somebody files.
   */
  const titleWidth = 250;
  const titleX = RIGHT - titleWidth;

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(18);
  doc.text(data.isPaid ? 'TAX INVOICE' : 'INVOICE', titleX, top, {
    width: titleWidth,
    align: 'right',
    characterSpacing: 1.6,
  });

  // The number, set once and set clearly. It is the string every other system
  // quotes back — a support email, a bank narration, an accountant's query.
  doc.font('Helvetica').fontSize(10).fillColor(MUTED);
  doc.text(data.invoiceNumber, titleX, doc.y + 5, {
    width: titleWidth,
    align: 'right',
  });

  /**
   * Whether the money arrived, as a badge rather than as a sentence.
   *
   * Paid wears the store's own colour, darkened until it can be read; unpaid
   * wears neutral grey on purpose. An unpaid invoice badged in a cheerful brand
   * tint reads as a receipt at a glance, and a glance is all most people give it.
   */
  const badgeBottom = badge(
    doc,
    data.isPaid ? 'PAID' : 'PAYMENT DUE',
    data.isPaid ? palette.strong : INK,
    data.isPaid ? palette.tint : PANEL,
    RIGHT,
    doc.y + 9,
  );

  /**
   * The one place both colours appear together: a 2pt rule across the measure,
   * mostly primary with a short secondary tail.
   *
   * Two colours meeting in a line is enough to read as deliberate. Two colours
   * meeting as adjacent filled bands, which is what this replaced, reads as a
   * flag.
   */
  const ruleY = Math.max(leftBottom, badgeBottom) + 16;
  const tail = 72;
  doc.rect(MARGIN, ruleY, MEASURE - tail, 2).fill(palette.primary);
  doc.rect(RIGHT - tail, ruleY, tail, 2).fill(palette.secondary);

  doc.y = ruleY + 18;
}

/**
 * Who issued it, and the facts that date it.
 *
 * The invoice number is not repeated here, even though a meta table is where an
 * eye trained on other invoices looks for it: it is already set under the title,
 * and the same string twice within 60pt reads as a template that lost track of
 * itself.
 */
function details(doc: Doc, data: InvoiceData): void {
  const top = doc.y;

  const valueWidth = 132;
  const labelWidth = 104;
  const labelX = RIGHT - valueWidth - labelWidth;

  /**
   * The seller column stops short of where the dated facts begin.
   *
   * It used to be a flat 290pt starting at the margin, which ends 19pt *past*
   * the first pixel of the right-hand labels. Nothing collided while the only
   * thing on that line was `hello@shop.example`, and a store that put its real
   * accounts address there — the long one, with the department in it — printed
   * an invoice with its email running under "Invoice date".
   */
  const sellerWidth = labelX - MARGIN - 20;

  const identity = [
    data.seller.gstin ? `GSTIN ${data.seller.gstin}` : null,
    data.seller.pan ? `PAN ${data.seller.pan}` : null,
  ].filter(Boolean) as string[];

  const runs: Run[] = [
    ...data.seller.lines.map((line) => body(line)),
    ...(identity.length > 0
      ? [{ text: identity.join('   ·   '), font: BOLD, size: 9, color: INK, gap: 5 }]
      : []),
    ...contactRuns(doc, data.seller, sellerWidth),
  ];

  const sellerBottom = drawRuns(doc, runs, MARGIN, top, sellerWidth);

  /**
   * The dated facts, right-aligned against the seller block.
   *
   * Place of supply sits here rather than with the delivery address because it
   * is the field that decides whether the tax below is one head or two, and it
   * is read next to the dates. Printed only for a registered store: for anyone
   * else it is a term with no meaning on their invoice.
   */
  const rows: [string, string][] = [
    ['Invoice date', formatDate(data.issuedAt)],
    ['Order no.', data.orderNumber],
    ['Order date', formatDate(data.placedAt)],
  ];
  if (data.paymentMethod) rows.push(['Payment', data.paymentMethod]);
  if (data.seller.gstin && data.shipTo.state) {
    rows.push(['Place of supply', data.shipTo.state]);
  }

  let rowY = top;
  for (const [label, value] of rows) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(label, labelX, rowY, { width: labelWidth, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
    doc.text(value, RIGHT - valueWidth, rowY, { width: valueWidth, align: 'right' });
    rowY = doc.y + 2;
  }

  const bottom = Math.max(rowY, sellerBottom) + 16;
  doc.strokeColor(RULE).lineWidth(1);
  doc.moveTo(MARGIN, bottom).lineTo(RIGHT, bottom).stroke();
  doc.y = bottom + 18;
}

/**
 * The two addresses, side by side on tinted plates.
 *
 * Plated rather than left loose on the paper because this is the only place on
 * the sheet where the same name can appear twice for two different reasons, and
 * a reader has to see at a glance that they are two answers and not one
 * paragraph. The primary marks who is billed and the secondary who receives —
 * the same two colours doing the same job they do in the rule above and the
 * total below.
 */
function parties(doc: Doc, data: InvoiceData, palette: Palette): void {
  const gap = 18;
  const width = (MEASURE - gap) / 2;
  const padding = 14;
  const inner = width - padding - 12;

  const billed = partyRuns('Billed to', data.billTo);
  const delivered = partyRuns('Delivered to', data.shipTo);

  const height =
    Math.max(runsHeight(doc, billed, inner), runsHeight(doc, delivered, inner)) +
    padding * 2;

  const top = doc.y;
  const rightX = MARGIN + width + gap;

  plate(doc, MARGIN, top, width, height, palette.wash, palette.primary);
  plate(doc, rightX, top, width, height, palette.wash, palette.secondary);

  drawRuns(doc, billed, MARGIN + padding, top + padding, inner);
  drawRuns(doc, delivered, rightX + padding, top + padding, inner);

  doc.y = top + height + 18;
}

/** Returns the y the table finished at. */
function table(
  doc: Doc,
  data: InvoiceData,
  palette: Palette,
  money: (value: string) => string,
): number {
  let y = tableHead(doc, doc.y, palette);

  data.lines.forEach((line, index) => {
    const meta = lineMeta(line, money);

    const nameHeight = doc
      .font('Helvetica')
      .fontSize(9)
      .heightOfString(line.description, { width: COLUMNS.description.width });
    const metaHeight = meta
      ? doc
          .font('Helvetica')
          .fontSize(7.5)
          .heightOfString(meta, { width: COLUMNS.description.width })
      : 0;
    const height = Math.max(nameHeight + metaHeight, 16) + 12;

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

    if (meta) {
      doc.fontSize(7.5).fillColor(MUTED);
      doc.text(meta, COLUMNS.description.x, doc.y + 1, {
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
    // A hairline, not a rule: at full strength one of these between every row
    // turns the block into a grid, and a grid is a spreadsheet.
    doc.strokeColor(HAIRLINE).lineWidth(0.5);
    doc.moveTo(MARGIN, y - 6).lineTo(RIGHT, y - 6).stroke();
  });

  return y;
}

function tableHead(doc: Doc, y: number, palette: Palette): number {
  // The store's colour at 5%, not a neutral grey: the column headings should
  // belong to the same document as the rule above them.
  doc.rect(MARGIN, y, MEASURE, 22).fill(palette.wash);
  // A hairline of the primary under the headings, so the table has a top edge
  // that is the brand rather than another grey.
  doc.rect(MARGIN, y + 22, MEASURE, 1).fill(palette.primary);

  doc.fillColor(LABEL).font('Helvetica-Bold').fontSize(7.5);

  const textY = y + 7.5;
  const spaced = { characterSpacing: 0.7 };
  doc.text('#', COLUMNS.index.x, textY, { width: COLUMNS.index.width, ...spaced });
  doc.text('DESCRIPTION', COLUMNS.description.x, textY, {
    width: COLUMNS.description.width,
    ...spaced,
  });
  right(doc, 'QTY', COLUMNS.quantity, textY, spaced);
  right(doc, 'RATE', COLUMNS.rate, textY, spaced);
  right(doc, 'TAX', COLUMNS.tax, textY, spaced);
  right(doc, 'AMOUNT', COLUMNS.amount, textY, spaced);

  return y + 34;
}

/**
 * What is owed, in figures and in words, and what is left to pay.
 *
 * The words are not decoration. An amount in words is the convention that makes
 * a total hard to alter after the fact, it is expected on an Indian invoice, and
 * it fills the half of the page a totals stack leaves empty — which is the hole
 * that made every earlier draft of this sheet look unfinished.
 */
function summary(
  doc: Doc,
  data: InvoiceData,
  palette: Palette,
  money: (value: string) => string,
  tableEnd: number,
): void {
  const width = 226;
  const x = RIGHT - width;
  const labelWidth = width - 116;

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

  /**
   * The note that sits under the balance: what settles it, and who to ask.
   *
   * Measured here rather than at the point it is drawn, because it is part of
   * the settlement block and has to be counted in `needed` below. A page break
   * that took the figure and left the instruction behind would put "Balance due
   * Rs. 4,200.00" at the foot of one sheet and "Payable by..." at the head of
   * the next, which is the one arrangement worse than not printing it at all.
   */
  const noteWidth = width - 28;
  const settlementNote = settlementRuns(doc, data, noteWidth);
  const settlementHeight = 46 + runsHeight(doc, settlementNote, noteWidth) + 10;

  const plateHeight = 36;
  const needed = rows.length * 15 + 12 + plateHeight + settlementHeight;

  // Nine rows of totals will not fit under a table that ended near the foot.
  let y = tableEnd + 12;
  if (y + needed > BOTTOM) {
    doc.addPage();
    y = MARGIN;
  }

  // --- The words, on the left ---
  const words = amountInWords(data.grandTotal, data.currency);
  if (words) {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(LABEL);
    doc.text('AMOUNT IN WORDS', MARGIN, y, { characterSpacing: 0.8 });
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(INK);
    doc.text(words, MARGIN, doc.y + 4, { width: x - MARGIN - 28 });
  }

  // --- The figures, on the right ---
  for (const [label, value] of rows) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(label, x, y, { width: labelWidth });
    doc.fillColor(INK);
    doc.text(value, x + labelWidth, y, { width: 116, align: 'right' });
    y += 15;
  }

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
  plate(doc, x, y, width, plateHeight, palette.wash, palette.secondary);

  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK);
  doc.text('Total', x + 14, y + 13, { width: labelWidth });
  doc.fontSize(12.5);
  doc.text(money(data.grandTotal), x + labelWidth, y + 11, {
    width: 104,
    align: 'right',
  });
  y += plateHeight + 12;

  /**
   * Settlement: what has been paid, and what is still owed.
   *
   * Taken from `isPaid` rather than from a payments ledger, because that is the
   * only fact the order carries — it is paid or it is not, and there is no
   * partial state to represent. Printing the pair even when the balance is nil
   * is the point: "Balance due Rs. 0.00" is what a buyer looks for on a receipt,
   * and its absence is what makes people ring up to ask.
   */
  const paid = data.isPaid ? data.grandTotal : '0.00';
  const balance = data.isPaid ? '0.00' : data.grandTotal;

  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  doc.text('Amount paid', x + 14, y, { width: labelWidth });
  doc.fillColor(INK);
  doc.text(money(paid), x + labelWidth, y, { width: 104, align: 'right' });
  y += 16;

  doc.strokeColor(RULE).lineWidth(0.5);
  doc.moveTo(x + 14, y - 4).lineTo(RIGHT, y - 4).stroke();

  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK);
  doc.text('Balance due', x + 14, y + 3, { width: labelWidth });
  doc.text(money(balance), x + labelWidth, y + 3, { width: 104, align: 'right' });

  // Past the bottom of the balance row, not past its top: the row is drawn at
  // an explicit y, so whatever comes next has only this number to tell it where
  // the block actually ended.
  y += 20;

  doc.y = drawRuns(doc, settlementNote, x + 14, y, noteWidth) + 4;
}

/**
 * What to do about the figure above, printed under it.
 *
 * Two lines at most. The first says how the balance stands — settled by
 * whichever method the order carries, or still payable by it — and the second
 * gives the shop's billing address and number, which is the pair a buyer needs
 * when they want to query the amount or tell somebody they have paid it.
 *
 * Those two details are already on the letterhead. They are repeated here on
 * purpose, for two reasons: a long order pushes the totals onto a second sheet
 * that carries no letterhead at all, and an accounts department that queries an
 * invoice reads from the number outward rather than from the top of the page
 * down. The values are `seller.email` and `seller.phone`, so a shop that has set
 * a separate billing address in Settings gets *that* one here — the invoice
 * asks people to write where invoices are actually read.
 *
 * A store with neither on file prints the first line alone rather than a
 * dangling "Queries:" with nothing after it.
 */
function settlementRuns(doc: Doc, data: InvoiceData, width: number): Run[] {
  const { standing, reach } = settlementNote(data);

  const note = (text: string, gap: number): Run => ({
    text,
    font: 'Helvetica',
    size: 7.5,
    color: MUTED,
    gap,
  });

  const runs: Run[] = [note(standing, 8)];
  if (reach.length === 0) return runs;

  /**
   * Joined on one line while it fits, split when it does not — the same rule
   * `contactRuns` follows for the letterhead, and for the same reason: the
   * separator is the only break opportunity in the string, so pdfkit wrapping
   * it strands the number on its own line anyway.
   */
  const label = 'Queries: ';
  const joined = label + reach.join('   ·   ');
  doc.font('Helvetica').fontSize(7.5);

  if (reach.length === 1 || doc.widthOfString(joined) <= width) {
    runs.push(note(joined, 2));
  } else {
    runs.push(note(label + reach[0], 2), note(reach[1], 1));
  }

  return runs;
}

/**
 * The wording, separated from the layout so it can be read as text in a test.
 *
 * What the note says is the part that has to be *true* — an invoice that tells
 * a buyer to pay an amount already collected, or that names a payment method
 * the order never used, is a document the shop has to apologise for. How it
 * wraps is a typographic detail and stays in `settlementRuns`.
 */
export function settlementNote(data: InvoiceData): { standing: string; reach: string[] } {
  const method = data.paymentMethod?.trim();

  return {
    standing: data.isPaid
      ? `Received in full${method ? ` by ${method}` : ''}. Nothing further is due.`
      : `Payable${method ? ` by ${method}` : ''}. Please quote ${data.invoiceNumber}.`,
    reach: [data.seller.email, data.seller.phone]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  };
}

/**
 * Notes and the signature block, sitting at the foot of the last sheet.
 *
 * Anchored down rather than allowed to follow the totals. A three-line order
 * finishes barely halfway down an A4 page, and a document whose content stops in
 * mid-air with 300pt of white under it looks like a form somebody abandoned.
 * Pushed to the bottom, the same content reads as the close of a letter.
 */
function closing(doc: Doc, data: InvoiceData, palette: Palette): void {
  const gap = 24;
  const notesWidth = Math.round(MEASURE * 0.56);
  const signWidth = MEASURE - notesWidth - gap;
  const padding = 13;

  const notes = data.notes?.trim();
  const notesRuns: Run[] = notes
    ? [
        { text: 'NOTES', font: BOLD, size: 7.5, color: LABEL, gap: 0, spacing: 0.8 },
        { text: notes, font: 'Helvetica', size: 9, color: INK, gap: 5 },
      ]
    : [];

  const notesHeight = notes
    ? runsHeight(doc, notesRuns, notesWidth - padding * 2) + padding * 2
    : 0;

  /**
   * The signature block is measured rather than assumed, because the tallest
   * thing in it is the store's own name and "Northwind Trading Company Private
   * Limited" is two lines where "Voltway" is one.
   *
   * The room left to sign in is then squeezed to fit whatever the page has
   * left. A signature is worth 28pt of air and will make do with 14, and
   * neither is worth spilling a three-line invoice onto a second sheet for.
   */
  doc.font('Helvetica').fontSize(8.5);
  const forHeight = doc.heightOfString('For', { width: signWidth });
  doc.font(BOLD).fontSize(9.5);
  const nameHeight = doc.heightOfString(data.seller.name, { width: signWidth });

  const ruledCaption = 16;
  const available = BOTTOM - (doc.y + 10);
  const air = Math.max(
    14,
    Math.min(28, available - forHeight - nameHeight - ruledCaption),
  );
  const signHeight = forHeight + nameHeight + air + ruledCaption;
  const height = Math.max(notesHeight, signHeight);

  let top = doc.y + 10;
  if (top + height > BOTTOM) {
    doc.addPage();
    top = MARGIN;
  } else {
    top = Math.max(top, BOTTOM - height);
  }

  if (notes) {
    // The one neutral panel on the sheet. Notes carry bank details more often
    // than they carry anything else, and a tenant tint behind an account number
    // helps nobody read it.
    doc.rect(MARGIN, top, notesWidth, notesHeight).fill(PANEL);
    doc.strokeColor(RULE).lineWidth(0.5);
    doc.rect(MARGIN, top, notesWidth, notesHeight).stroke();
    drawRuns(doc, notesRuns, MARGIN + padding, top + padding, notesWidth - padding * 2);
  }

  /**
   * The signature block.
   *
   * Left blank on purpose: the file is generated and nobody signs it, but a shop
   * that prints a copy to hand across a counter needs somewhere to put a stamp,
   * and a buyer's accounts department expects the line to exist. The footer says
   * the document is valid without one, so the two do not contradict each other.
   */
  const signX = RIGHT - signWidth;
  const signBottom = top + height;

  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
  doc.text('For', signX, signBottom - signHeight, { width: signWidth, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK);
  doc.text(data.seller.name, signX, doc.y + 1, { width: signWidth, align: 'right' });

  doc.strokeColor(palette.primary).lineWidth(1);
  doc
    .moveTo(signX + Math.max(0, signWidth - 150), signBottom - 15)
    .lineTo(RIGHT, signBottom - 15)
    .stroke();

  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  doc.text('Authorised signatory', signX, signBottom - 11, {
    width: signWidth,
    align: 'right',
    characterSpacing: 0.3,
  });

  doc.y = signBottom;
}

/**
 * Stamped on every page at the end, once the page count is known. Written during
 * the draw it would land only on the page the cursor happened to be on, and a
 * two-page invoice would have an unnumbered sheet.
 */
function footer(doc: Doc, data: InvoiceData, palette: Palette): void {
  const range = doc.bufferedPageRange();
  const y = PAGE.height - MARGIN - 28;
  const tail = 72;

  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);

    /**
     * A hairline inside the margin rather than a bar bled to the paper edge, and
     * two-tone like the one under the masthead.
     *
     * The full-width version was the second dark slab on the page — head and
     * foot — and between them the document read as boxed in. A 1pt rule at the
     * measure still marks a second sheet as part of the same document, which is
     * all it was ever for.
     */
    doc.rect(MARGIN, y, MEASURE - tail, 1).fill(palette.primary);
    doc.rect(RIGHT - tail, y, tail, 1).fill(palette.secondary);

    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED);
    doc.text(
      `${data.invoiceNumber}   ·   Computer generated invoice; valid without a signature` +
        (range.count > 1 ? `   ·   Page ${i - range.start + 1} of ${range.count}` : ''),
      MARGIN,
      y + 12,
      { width: MEASURE, align: 'center', characterSpacing: 0.2 },
    );
  }
}

// --- Text blocks -------------------------------------------------------------

const BOLD = 'Helvetica-Bold';

/**
 * One line of a stacked text block.
 *
 * Blocks are described before they are drawn because the plate behind them has
 * to be filled *first* — a rectangle painted after the type would bury it — and
 * its height is not known until the type has been measured. One description,
 * measured by `runsHeight` and drawn by `drawRuns`, keeps the two passes from
 * disagreeing about what is in the block.
 */
interface Run {
  text: string;
  font: string;
  size: number;
  color: string;
  /** Air above this line. */
  gap: number;
  spacing?: number;
}

function body(text: string, gap = 1): Run {
  return { text, font: 'Helvetica', size: 9, color: MUTED, gap };
}

function partyRuns(heading: string, value: InvoiceParty): Run[] {
  const extra = [
    value.gstin ? `GSTIN ${value.gstin}` : null,
    value.email,
    value.phone,
  ].filter(Boolean) as string[];

  return [
    {
      text: heading.toUpperCase(),
      font: BOLD,
      size: 7.5,
      color: LABEL,
      gap: 0,
      spacing: 0.8,
    },
    { text: value.name, font: BOLD, size: 10.5, color: INK, gap: 6 },
    ...value.lines.map((line) => body(line)),
    ...extra.map((line) => body(line)),
  ];
}

/**
 * The shop's email and phone number, on one line or on two.
 *
 * Joined with a separator while they fit, because that is one line of grey
 * under the address instead of two and the block reads as a signature. Split
 * the moment they do not, because the alternative — pdfkit wrapping a line
 * whose only break opportunity is the separator — leaves a phone number
 * stranded on a line of its own anyway, after the email has already been
 * squeezed. Measured rather than guessed at a character count: "Rs." is not the
 * only thing on this page whose width depends on the glyphs.
 */
function contactRuns(doc: Doc, seller: InvoiceParty, width: number): Run[] {
  const parts = [seller.email, seller.phone].filter(Boolean) as string[];
  if (parts.length === 0) return [];

  const joined = parts.join('   ·   ');
  doc.font('Helvetica').fontSize(9);

  if (parts.length === 1 || doc.widthOfString(joined) <= width) {
    return [body(joined, 4)];
  }

  return parts.map((part, index) => body(part, index === 0 ? 4 : 1));
}

function runsHeight(doc: Doc, runs: Run[], width: number): number {
  return runs.reduce((total, run) => {
    doc.font(run.font).fontSize(run.size);
    return (
      total +
      run.gap +
      doc.heightOfString(run.text, { width, characterSpacing: run.spacing ?? 0 })
    );
  }, 0);
}

/** Draws the block and returns the y it ended at. */
function drawRuns(doc: Doc, runs: Run[], x: number, y: number, width: number): number {
  let top = y;
  for (const run of runs) {
    doc.font(run.font).fontSize(run.size).fillColor(run.color);
    doc.text(run.text, x, top + run.gap, {
      width,
      characterSpacing: run.spacing ?? 0,
    });
    top = doc.y;
  }
  return top;
}

// --- Marks -------------------------------------------------------------------

/**
 * A tinted block with a coloured edge down its left side.
 *
 * The hairline border is unconditional, and for the same reason `edgeOf` gives
 * in `common/colour`: a 5% wash of a pale brand is within a hair of white, and
 * without an outline such a store's address blocks simply vanish.
 */
function plate(
  doc: Doc,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  edge: string,
): void {
  doc.rect(x, y, width, height).fill(fill);
  doc.strokeColor(RULE).lineWidth(0.5);
  doc.rect(x, y, width, height).stroke();
  doc.rect(x, y, 3, height).fill(edge);
}

/** A pill, sized to its own label, hung from the right edge. */
function badge(
  doc: Doc,
  label: string,
  ink: string,
  fill: string,
  rightEdge: number,
  y: number,
): number {
  const height = 17;
  doc.font(BOLD).fontSize(7.5);
  const width = doc.widthOfString(label, { characterSpacing: 1 }) + 22;
  const x = rightEdge - width;

  doc.roundedRect(x, y, width, height, height / 2).fill(fill);
  doc.fillColor(ink);
  doc.text(label, x, y + 5.4, { width, align: 'center', characterSpacing: 1 });

  return y + height;
}

// --- Helpers -----------------------------------------------------------------

function right(
  doc: Doc,
  text: string,
  column: { x: number; width: number },
  y: number,
  options: PDFKit.Mixins.TextOptions = {},
): void {
  doc.text(text, column.x, y, { width: column.width, align: 'right', ...options });
}

/**
 * The small grey line under a product name.
 *
 * The variant and SKU, plus the discount when there was one. A per-line discount
 * that appears nowhere on the invoice is the sort of omission a buyer notices
 * when the arithmetic on their own copy does not close, and there is no room on
 * the measure for a seventh column.
 */
function lineMeta(line: InvoiceLine, money: (value: string) => string): string | null {
  const parts = [
    line.meta?.trim() || null,
    Number(line.discount) > 0 ? `less ${money(line.discount)}` : null,
  ].filter(Boolean) as string[];

  return parts.length > 0 ? parts.join('  ·  ') : null;
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

// --- The total, written out --------------------------------------------------

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

/** 0–99. Hyphenated above twenty, which is how a cheque is written. */
function underHundred(n: number): string {
  if (n < 20) return ONES[n];
  const unit = n % 10;
  const ten = TENS[Math.floor(n / 10)];
  return unit === 0 ? ten : `${ten}-${ONES[unit]}`;
}

function underThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [
    hundreds > 0 ? `${ONES[hundreds]} Hundred` : '',
    rest > 0 ? underHundred(rest) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Lakh and crore: the grouping the figures on this invoice are already in. */
function indianWords(n: number): string {
  if (n === 0) return 'Zero';

  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1e3;

  return [
    // Recursive, so that 132 crore reads "One Hundred Thirty-Two Crore" rather
    // than running out of names above the largest one.
    crore > 0 ? `${indianWords(crore)} Crore` : '',
    lakh > 0 ? `${underHundred(lakh)} Lakh` : '',
    thousand > 0 ? `${underHundred(thousand)} Thousand` : '',
    rest > 0 ? underThousand(rest) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Thousand, million, billion — for the currencies that count that way. */
function westernWords(n: number): string {
  if (n === 0) return 'Zero';

  const scales: [number, string][] = [
    [1e9, 'Billion'],
    [1e6, 'Million'],
    [1e3, 'Thousand'],
  ];

  let rest = n;
  const parts: string[] = [];
  for (const [size, name] of scales) {
    const count = Math.floor(rest / size);
    if (count > 0) parts.push(`${westernWords(count)} ${name}`);
    rest %= size;
  }
  if (rest > 0) parts.push(underThousand(rest));

  return parts.join(' ');
}

/**
 * The total, written out.
 *
 * Every Indian invoice carries one, for a reason that outlived the paper it was
 * invented for: figures can be altered with a pen and words cannot, so the words
 * are what a dispute falls back on. Rupees and paise are named because that is
 * the convention here; a foreign currency gets its ISO code and its minor unit
 * as a fraction, since guessing whether a currency's hundredth is called a cent,
 * a fils or a satang would be inventing facts about somebody else's money.
 *
 * Returns null for anything it cannot state honestly — a value that is not a
 * number, a negative one, or a figure past the largest scale named here — and
 * the caller prints no words at all rather than a wrong sentence.
 */
export function amountInWords(value: string, currency: string): string | null {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount < 0 || amount >= 1e12) return null;

  // Rounded to the paisa before it is split, and rounded the same way
  // `formatMoney` rounds — the words must never contradict the figure they are
  // printed under, which is the one job they have.
  const minor = Math.round(amount * 100);
  const whole = Math.floor(minor / 100);
  const fraction = minor % 100;

  if (currency === 'INR') {
    // Singular for one, because "One Paise Only" on a document somebody files
    // is the sort of thing that gets the rest of it read twice.
    const unit = fraction === 1 ? 'Paisa' : 'Paise';
    const paise = fraction > 0 ? ` and ${underHundred(fraction)} ${unit}` : '';
    return `Rupees ${indianWords(whole)}${paise} Only`;
  }

  const cents = fraction > 0 ? ` and ${String(fraction).padStart(2, '0')}/100` : '';
  return `${currency} ${westernWords(whole)}${cents} Only`;
}
