/**
 * The shape an invoice is rendered from.
 *
 * Deliberately free of Prisma types and of Decimal: every money value arrives
 * as a fixed-2 string, already computed. That keeps the renderer a pure
 * function of its input — it can be unit-tested without a database, and there
 * is no path by which drawing a PDF re-derives a total and disagrees with the
 * order the shopper actually paid for.
 */
export interface InvoiceParty {
  name: string;
  lines: string[];
  gstin?: string | null;
  pan?: string | null;
  email?: string | null;
  phone?: string | null;
  /** For the place-of-supply comparison that decides CGST/SGST versus IGST. */
  state?: string | null;
}

export interface InvoiceLine {
  description: string;
  /** Variant, SKU — printed small under the description. */
  meta?: string | null;
  quantity: number;
  unitPrice: string;
  discount: string;
  tax: string;
  lineTotal: string;
}

export interface InvoiceTaxLine {
  label: string;
  amount: string;
}

/**
 * How the invoice is dressed: the store's own two colours, and its mark.
 *
 * Two rather than one, and both the tenant's: a document set entirely in a
 * single hue reads as a template with a colour swapped into it, whereas a
 * primary that carries the heading band and a secondary that marks the totals
 * reads as stationery. Contrast is computed rather than assumed — see
 * `common/colour` — because a shopkeeper may pick a pale yellow, and an invoice
 * whose total cannot be read is not an invoice.
 */
export interface InvoiceBrand {
  primary: string;
  secondary: string;
  /**
   * PNG or JPEG bytes, already loaded and checked — never a URL.
   *
   * The renderer takes bytes precisely so it cannot be talked into making a
   * request: see `store-logo.ts` for the two narrow doors those bytes come
   * through. Null is the ordinary case and draws the business name in type.
   */
  logo: Buffer | null;
}

export interface InvoiceData {
  /** `INV-ORD-1042` — the store's prefix and the order number it belongs to. */
  invoiceNumber: string;
  orderNumber: string;
  issuedAt: Date;
  currency: string;
  /**
   * A tax invoice is issued for a paid order. An unpaid one still needs a
   * document — the shopper wants something to look at, and the shop wants
   * something to send with a payment link — so it prints under its own heading
   * rather than claiming to be a tax invoice.
   */
  isPaid: boolean;
  paymentMethod: string | null;
  placedAt: Date;

  seller: InvoiceParty;
  billTo: InvoiceParty;
  shipTo: InvoiceParty;

  lines: InvoiceLine[];
  subtotal: string;
  discountTotal: string;
  taxLines: InvoiceTaxLine[];
  taxTotal: string;
  shippingTotal: string;
  grandTotal: string;

  couponCode?: string | null;
  notes?: string | null;

  /** Absent falls back to the platform's own colours and no logo. */
  brand?: InvoiceBrand;
}
