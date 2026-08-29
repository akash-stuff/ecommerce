import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RequestContextStore } from '../common/context/request-context';
import { UpdateInvoiceSettingsDto } from './dto/invoice.dto';
import type {
  InvoiceData,
  InvoiceLine,
  InvoiceParty,
  InvoiceTaxLine,
} from './invoice-data';
import { renderInvoicePdf } from './invoice-pdf';

/** What an invoice is rendered from, once the order and the store are known. */
type OrderForInvoice = Prisma.OrderGetPayload<{
  include: { items: true; payments: true };
}>;

/** The address shape checkout validates and stores as Json on the order. */
interface OrderAddress {
  fullName?: string;
  phone?: string;
  line1?: string;
  line2?: string | null;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface RenderedInvoice {
  filename: string;
  pdf: Buffer;
}

/**
 * Invoices.
 *
 * An invoice is a *view* of an order — it stores nothing of its own, and it is
 * rendered on demand from the order plus the store's invoicing details. That is
 * deliberate: an order's totals are already immutable (line items snapshot
 * name, SKU and price at purchase time), so re-rendering next year produces the
 * same document, and there is no second copy of the money to drift out of step
 * with the first.
 *
 * The invoice *number* is derived from the order number rather than drawn from
 * a counter. A counter would need a lock, would skip numbers on a rolled-back
 * transaction, and would let the same order produce two different invoice
 * numbers on two downloads. `INV-ORD-1042` is stable, unique within the store,
 * and readable next to the order it belongs to.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Settings --------------------------------------------------------------

  /**
   * What the shopkeeper typed, plus what an invoice would actually print.
   *
   * `effective` exists so the form can show the fallbacks instead of looking
   * empty: a store that has never opened this page still issues invoices, using
   * its trading name and address, and it should be able to see that rather than
   * assume nothing is configured.
   */
  async getSettings() {
    const store = await this.requireStore();

    return {
      businessName: store.invoiceBusinessName,
      gstin: store.invoiceGstin,
      pan: store.invoicePan,
      addressLine1: store.invoiceAddressLine1,
      addressLine2: store.invoiceAddressLine2,
      city: store.invoiceCity,
      state: store.invoiceState,
      postalCode: store.invoicePostalCode,
      email: store.invoiceEmail,
      phone: store.invoicePhone,
      prefix: store.invoicePrefix,
      notes: store.invoiceNotes,
      effective: seller(store),
    };
  }

  async updateSettings(dto: UpdateInvoiceSettingsDto) {
    const store = await this.requireStore();

    const data: Prisma.StoreUncheckedUpdateInput = {};

    // Blank clears the override and restores the fallback to the store's own
    // trading details; absent means the field is not being edited.
    const set = (
      value: string | undefined,
      column: keyof Prisma.StoreUncheckedUpdateInput,
      transform: (v: string) => string = (v) => v.trim(),
    ) => {
      if (value === undefined) return;
      const cleaned = value.trim() === '' ? null : transform(value);
      (data as Record<string, unknown>)[column as string] = cleaned;
    };

    set(dto.businessName, 'invoiceBusinessName');
    // Stored upper-cased: a GSTIN is defined in upper case and is compared by
    // eye against tax portals that print it that way.
    set(dto.gstin, 'invoiceGstin', (v) => v.trim().toUpperCase());
    set(dto.pan, 'invoicePan', (v) => v.trim().toUpperCase());
    set(dto.addressLine1, 'invoiceAddressLine1');
    set(dto.addressLine2, 'invoiceAddressLine2');
    set(dto.city, 'invoiceCity');
    set(dto.state, 'invoiceState');
    set(dto.postalCode, 'invoicePostalCode');
    set(dto.email, 'invoiceEmail');
    set(dto.phone, 'invoicePhone');
    set(dto.notes, 'invoiceNotes');

    // The prefix is NOT NULL with a default, because an invoice number is
    // always built from it. Clearing it means "no prefix", not "no column".
    if (dto.prefix !== undefined) data.invoicePrefix = dto.prefix.trim();

    await this.prisma.db.store.update({ where: { id: store.id }, data });

    void this.audit.record({
      action: 'invoice.settingsUpdated',
      entityType: 'Store',
      entityId: store.id,
      // Field names only. A GSTIN and a registered address are the store's own
      // details, and an audit trail is not the place to copy them.
      changes: { fields: Object.keys(dto) },
    });

    return this.getSettings();
  }

  // --- Documents -------------------------------------------------------------

  /**
   * The signed-in shopper's own invoice, found by order number.
   *
   * Scoped by customer id as well as by tenant, exactly like `/orders/mine`:
   * order numbers are sequential and guessable, so the customer filter is what
   * stops one shopper downloading another's invoice — which carries a full
   * delivery address.
   */
  async forCustomer(orderNumber: string): Promise<RenderedInvoice> {
    const customerId = RequestContextStore.get()?.customerId;
    if (!customerId) {
      throw new ForbiddenException({
        message: 'Sign in to download your invoice.',
        code: 'NOT_A_CUSTOMER',
      });
    }

    const order = await this.prisma.db.order.findFirst({
      where: { orderNumber, customerId },
      include: { items: true, payments: true },
    });

    if (!order) throw this.orderNotFound();
    return this.render(order);
  }

  /** The same document from the admin console, by order id. */
  async forStaff(orderId: string): Promise<RenderedInvoice> {
    const order = await this.prisma.db.order.findFirst({
      where: { id: orderId },
      include: { items: true, payments: true },
    });

    if (!order) throw this.orderNotFound();
    return this.render(order);
  }

  // ---------------------------------------------------------------------------

  private async render(order: OrderForInvoice): Promise<RenderedInvoice> {
    const store = await this.requireStore();

    const shipTo = order.shippingAddress as unknown as OrderAddress;
    const billTo = (order.billingAddress ?? order.shippingAddress) as unknown as OrderAddress;
    const from = seller(store);

    const invoiceNumber = `${store.invoicePrefix}${order.orderNumber}`;
    const isPaid = order.paymentStatus === 'PAID';

    const data: InvoiceData = {
      invoiceNumber,
      orderNumber: order.orderNumber,
      // An invoice is dated by the order it documents, not by the moment
      // someone happened to press Download — otherwise the same order yields a
      // different date every time and neither copy can be the real one.
      issuedAt: order.placedAt,
      placedAt: order.placedAt,
      currency: order.currency,
      isPaid,
      paymentMethod: paymentMethod(order),

      seller: from,
      billTo: toParty(billTo, order.customerEmail, order.customerPhone),
      shipTo: toParty(shipTo, null, null),

      lines: order.items.map(toLine),
      subtotal: order.subtotal.toFixed(2),
      discountTotal: order.discountTotal.toFixed(2),
      taxLines: taxBreakdown(
        order.taxTotal.toFixed(2),
        from.state,
        shipTo.state ?? null,
        Boolean(from.gstin),
      ),
      taxTotal: order.taxTotal.toFixed(2),
      shippingTotal: order.shippingTotal.toFixed(2),
      grandTotal: order.grandTotal.toFixed(2),
      couponCode: order.couponCode,
      notes: store.invoiceNotes,
    };

    return {
      // Only characters that survive a Content-Disposition header and a
      // Windows file name unharmed.
      filename: `${invoiceNumber.replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`,
      pdf: await renderInvoicePdf(data),
    };
  }

  private async requireStore() {
    const store = await this.prisma.db.store.findFirst();
    if (!store) {
      throw new NotFoundException({
        message: 'This tenant has no store yet.',
        code: 'STORE_NOT_FOUND',
      });
    }
    return store;
  }

  private orderNotFound(): NotFoundException {
    return new NotFoundException({
      message: 'That order does not exist.',
      code: 'ORDER_NOT_FOUND',
    });
  }
}

// --- Pure helpers ------------------------------------------------------------

type StoreRow = Prisma.StoreGetPayload<Record<string, never>>;

/**
 * Who the invoice is from.
 *
 * Each field falls back to the store's own trading details, so an invoice is
 * downloadable on day one and improves as the shopkeeper fills the form in.
 * Nothing here is required: a shop that never registers for GST simply has no
 * GSTIN line, rather than an empty one.
 */
export function seller(store: StoreRow): InvoiceParty {
  const lines = [
    store.invoiceAddressLine1 ?? store.addressLine1,
    store.invoiceAddressLine2 ?? store.addressLine2,
    [
      store.invoiceCity ?? store.city,
      store.invoiceState ?? store.state,
      store.invoicePostalCode ?? store.postalCode,
    ]
      .filter(Boolean)
      .join(', '),
  ].filter((line): line is string => Boolean(line && line.trim()));

  return {
    name: store.invoiceBusinessName ?? store.name,
    lines,
    gstin: store.invoiceGstin,
    pan: store.invoicePan,
    email: store.invoiceEmail ?? store.email,
    phone: store.invoicePhone ?? store.phone,
    state: store.invoiceState ?? store.state,
  };
}

function toParty(
  address: OrderAddress,
  email: string | null,
  phone: string | null,
): InvoiceParty {
  const lines = [
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(', '),
    address.country,
  ].filter((line): line is string => Boolean(line && line.trim()));

  return {
    name: address.fullName ?? 'Customer',
    lines,
    email,
    phone: phone ?? address.phone ?? null,
    state: address.state ?? null,
  };
}

function toLine(item: {
  productName: string;
  variantName: string | null;
  sku: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  discount: Prisma.Decimal;
  tax: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}): InvoiceLine {
  const meta = [item.variantName, `SKU ${item.sku}`].filter(Boolean).join(' · ');

  return {
    description: item.productName,
    meta,
    quantity: item.quantity,
    unitPrice: item.unitPrice.toFixed(2),
    discount: item.discount.toFixed(2),
    tax: item.tax.toFixed(2),
    lineTotal: item.lineTotal.toFixed(2),
  };
}

function paymentMethod(order: OrderForInvoice): string | null {
  const payment = order.payments.at(-1);
  if (!payment) return 'Cash on delivery';
  if (payment.provider === 'cod') return 'Cash on delivery';
  return payment.method ? `${payment.provider} · ${payment.method}` : payment.provider;
}

/**
 * The tax lines an invoice prints.
 *
 * India taxes an intra-state sale as CGST + SGST in equal halves and an
 * inter-state one as a single IGST, so the same money is described differently
 * depending on where it is going. Which applies is decided by comparing the
 * seller's state with the place of supply — the delivery address.
 *
 * Two honest limitations, both deliberate:
 *
 *   - An order stores one tax figure per line, not the rate behind it, so the
 *     breakdown is by head (CGST/SGST/IGST) and not by slab. A buyer claiming
 *     credit needs the head and the amount, which this gives.
 *   - States are compared as text, because that is what checkout collects. A
 *     mismatch in spelling falls through to IGST, which is the safer error:
 *     charging one head where two were due is a correctable filing, whereas
 *     splitting an inter-state sale is a wrong return.
 *
 * A store with no GSTIN gets a single unlabelled "Tax" line. Printing "CGST" on
 * an invoice from an unregistered shop would be a false statement on a tax
 * document.
 */
export function taxBreakdown(
  taxTotal: string,
  sellerState: string | null | undefined,
  placeOfSupply: string | null,
  hasGstin: boolean,
): InvoiceTaxLine[] {
  const total = Number(taxTotal);
  if (!Number.isFinite(total) || total <= 0) return [];
  if (!hasGstin) return [{ label: 'Tax', amount: taxTotal }];

  const intraState =
    Boolean(sellerState) &&
    Boolean(placeOfSupply) &&
    normaliseState(sellerState!) === normaliseState(placeOfSupply!);

  if (!intraState) return [{ label: 'IGST', amount: taxTotal }];

  // Halved to the paisa, with the remainder on the second line so the two
  // always add back to the total — an odd number of paise otherwise loses one.
  const half = Math.floor((total / 2) * 100) / 100;
  return [
    { label: 'CGST', amount: half.toFixed(2) },
    { label: 'SGST', amount: (total - half).toFixed(2) },
  ];
}

function normaliseState(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
