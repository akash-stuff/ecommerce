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
}
