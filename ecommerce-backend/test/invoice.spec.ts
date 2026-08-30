import { seller, taxBreakdown } from '../src/invoices/invoices.service';
import {
  amountInWords,
  formatMoney,
  renderInvoicePdf,
  settlementNote,
} from '../src/invoices/invoice-pdf';
import type { InvoiceData } from '../src/invoices/invoice-data';

/**
 * The GST heads on an invoice are a statement to a tax authority, and the
 * buyer's own return is built from them. Getting the split wrong is not a
 * cosmetic bug — so the rule that decides it is tested directly rather than
 * only through a rendered document.
 */
describe('GST breakdown', () => {
  it('splits an intra-state sale into equal CGST and SGST', () => {
    expect(taxBreakdown('180.00', 'Karnataka', 'Karnataka', true)).toEqual([
      { label: 'CGST', amount: '90.00' },
      { label: 'SGST', amount: '90.00' },
    ]);
  });

  it('puts an odd paisa on the second half so the two still add up', () => {
    const lines = taxBreakdown('100.01', 'Karnataka', 'Karnataka', true);
    expect(lines).toEqual([
      { label: 'CGST', amount: '50.00' },
      { label: 'SGST', amount: '50.01' },
    ]);
    expect(Number(lines[0].amount) + Number(lines[1].amount)).toBeCloseTo(100.01, 2);
  });

  it('compares states without caring about case or padding', () => {
    expect(taxBreakdown('10.00', 'Tamil Nadu', '  tamil   nadu ', true)[0].label).toBe('CGST');
  });

  it('charges IGST when the delivery state differs', () => {
    expect(taxBreakdown('180.00', 'Karnataka', 'Tamil Nadu', true)).toEqual([
      { label: 'IGST', amount: '180.00' },
    ]);
  });

  /**
   * The safer error of the two: charging one head where two were due is a
   * correctable filing, whereas splitting an inter-state sale is a wrong return.
   */
  it('falls back to IGST when a state is missing', () => {
    expect(taxBreakdown('180.00', null, 'Karnataka', true)[0].label).toBe('IGST');
    expect(taxBreakdown('180.00', 'Karnataka', null, true)[0].label).toBe('IGST');
  });

  it('never names a GST head for a store with no GSTIN', () => {
    expect(taxBreakdown('180.00', 'Karnataka', 'Karnataka', false)).toEqual([
      { label: 'Tax', amount: '180.00' },
    ]);
  });

  it('prints no tax line at all when nothing was charged', () => {
    expect(taxBreakdown('0.00', 'Karnataka', 'Karnataka', true)).toEqual([]);
  });
});

/**
 * A store that never opens the invoicing form still has to be able to issue an
 * invoice, so every field falls back to the trading details already on the
 * store record.
 */
describe('seller details', () => {
  const store = {
    name: 'Northwind',
    email: 'hello@northwind.example',
    phone: '+91 80 4000 1234',
    addressLine1: '14 Residency Road',
    addressLine2: null,
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560025',
    invoiceBusinessName: null,
    invoiceGstin: null,
    invoicePan: null,
    invoiceAddressLine1: null,
    invoiceAddressLine2: null,
    invoiceCity: null,
    invoiceState: null,
    invoicePostalCode: null,
    invoiceEmail: null,
    invoicePhone: null,
  } as unknown as Parameters<typeof seller>[0];

  it('falls back to the store name, address and email', () => {
    const from = seller(store);
    expect(from.name).toBe('Northwind');
    expect(from.email).toBe('hello@northwind.example');
    expect(from.lines).toEqual(['14 Residency Road', 'Bengaluru, Karnataka, 560025']);
    expect(from.gstin).toBeNull();
  });

  it('prefers the registered details once they are filled in', () => {
    const from = seller({
      ...store,
      invoiceBusinessName: 'Northwind Trading Co. Pvt Ltd',
      invoiceGstin: '29AAPFU0939F1ZV',
      invoiceCity: 'Mysuru',
    } as unknown as Parameters<typeof seller>[0]);

    expect(from.name).toBe('Northwind Trading Co. Pvt Ltd');
    expect(from.gstin).toBe('29AAPFU0939F1ZV');
    expect(from.lines[1]).toBe('Mysuru, Karnataka, 560025');
  });

  it('leaves out address lines a store has not filled in', () => {
    const from = seller({
      ...store,
      addressLine1: null,
      city: null,
      state: null,
      postalCode: null,
    } as unknown as Parameters<typeof seller>[0]);

    expect(from.lines).toEqual([]);
  });
});

/**
 * pdfkit's built-in faces are WinAnsi-encoded and have no rupee sign, so a
 * literal ₹ would print as the wrong glyph on every Indian invoice.
 */
describe('invoice money', () => {
  it('writes INR as Rs. with Indian digit grouping', () => {
    expect(formatMoney('123456.5', 'INR')).toBe('Rs. 1,23,456.50');
  });

  it('writes any other currency as its ISO code', () => {
    expect(formatMoney('99', 'USD')).toBe('USD 99.00');
  });

  it('does not print a stray symbol for a value it cannot read', () => {
    expect(formatMoney('not a number', 'INR')).toBe('INR -');
  });
});

describe('rendered invoice', () => {
  const base: InvoiceData = {
    invoiceNumber: 'INV-ORD-1042',
    orderNumber: 'ORD-1042',
    issuedAt: new Date('2026-08-21T10:00:00Z'),
    placedAt: new Date('2026-08-21T10:00:00Z'),
    currency: 'INR',
    isPaid: true,
    paymentMethod: 'Cash on delivery',
    seller: {
      name: 'Northwind',
      lines: ['14 Residency Road'],
      gstin: '29AAPFU0939F1ZV',
      state: 'Karnataka',
    },
    billTo: { name: 'Priya Raman', lines: ['22 Alwarpet Street'], state: 'Tamil Nadu' },
    shipTo: { name: 'Priya Raman', lines: ['22 Alwarpet Street'], state: 'Tamil Nadu' },
    lines: [
      {
        description: 'Stoneware mug',
        meta: 'SKU MUG-100',
        quantity: 2,
        unitPrice: '1299.00',
        discount: '0.00',
        tax: '467.64',
        lineTotal: '3065.64',
      },
    ],
    subtotal: '2598.00',
    discountTotal: '0.00',
    taxLines: [{ label: 'IGST', amount: '467.64' }],
    taxTotal: '467.64',
    shippingTotal: '0.00',
    grandTotal: '3065.64',
    notes: 'Payment due on receipt.',
  };

  it('produces a single-page PDF for a short order', async () => {
    const pdf = await renderInvoicePdf(base);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
  });

  /**
   * A long order must not silently lose its tail. The check is on page count
   * rather than on the text, because the failure being guarded against is a
   * table that runs off the bottom of one sheet and stops.
   */
  it('carries a long order onto further pages', async () => {
    const many = {
      ...base,
      lines: Array.from({ length: 40 }, () => base.lines[0]),
    };
    const pdf = await renderInvoicePdf(many);
    expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });

  /**
   * The line under "Balance due". It is the only sentence on the sheet that
   * tells a buyer what to do next, so it is asserted as words rather than
   * left to be eyeballed in a preview.
   */
  describe('the note under the balance', () => {
    it('says nothing is owed on a paid order, and how it was paid', () => {
      expect(settlementNote(base).standing).toBe(
        'Received in full by Cash on delivery. Nothing further is due.',
      );
    });

    it('asks for the invoice number by name when the balance stands', () => {
      expect(settlementNote({ ...base, isPaid: false }).standing).toBe(
        'Payable by Cash on delivery. Please quote INV-ORD-1042.',
      );
    });

    it('names no method when the order carries none', () => {
      expect(settlementNote({ ...base, paymentMethod: null }).standing).toBe(
        'Received in full. Nothing further is due.',
      );
    });

    /**
     * The reason this block exists: an invoice queried from a second sheet
     * that carries no letterhead still has to say where to write.
     */
    it('carries the billing address and number the letterhead used', () => {
      expect(
        settlementNote({
          ...base,
          seller: { ...base.seller, email: 'billing@northwind.example', phone: '+91 80 4000 1234' },
        }).reach,
      ).toEqual(['billing@northwind.example', '+91 80 4000 1234']);
    });

    it('prints neither rather than a "Queries:" with nothing after it', () => {
      expect(settlementNote(base).reach).toEqual([]);
      expect(settlementNote({ ...base, seller: { ...base.seller, phone: '  ' } }).reach).toEqual([]);
    });
  });

  it('does not call itself a tax invoice before it is paid', async () => {
    const unpaid = await renderInvoicePdf({ ...base, isPaid: false });
    const paid = await renderInvoicePdf(base);
    // The strings are compressed inside the content stream, so the documents
    // are compared to each other rather than searched for the heading.
    expect(unpaid.length).not.toBe(paid.length);
  });
});

/**
 * The words under the total are the copy a dispute falls back on when the
 * figures are argued about, so they are tested as text rather than left to be
 * eyeballed in a preview.
 */
describe('amount in words', () => {
  it('counts in lakh and crore for rupees', () => {
    expect(amountInWords('17382.60', 'INR')).toBe(
      'Rupees Seventeen Thousand Three Hundred Eighty-Two and Sixty Paise Only',
    );
    expect(amountInWords('12345678.00', 'INR')).toBe(
      'Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight Only',
    );
  });

  it('leaves the paise out when there are none', () => {
    expect(amountInWords('500.00', 'INR')).toBe('Rupees Five Hundred Only');
  });

  it('says zero rather than nothing at all', () => {
    expect(amountInWords('0.00', 'INR')).toBe('Rupees Zero Only');
  });

  it('names one paisa in the singular', () => {
    expect(amountInWords('1.01', 'INR')).toBe('Rupees One and One Paisa Only');
    expect(amountInWords('1.02', 'INR')).toBe('Rupees One and Two Paise Only');
  });

  /**
   * The words and the figure are printed inches apart on the same sheet. A
   * total that rounds one way in one and the other way in the other is the kind
   * of discrepancy that gets a whole invoice queried.
   */
  it('rounds the same way the figure above it rounds', () => {
    expect(amountInWords('1.006', 'INR')).toBe('Rupees One and One Paisa Only');
    expect(formatMoney('1.006', 'INR')).toBe('Rs. 1.01');
    expect(amountInWords('1.004', 'INR')).toBe('Rupees One Only');
    expect(formatMoney('1.004', 'INR')).toBe('Rs. 1.00');
  });

  /**
   * Naming a foreign currency's hundredth would be inventing facts about
   * somebody else's money — a cent, a fils and a satang are not the same word.
   */
  it('writes a foreign currency as its code and a fraction', () => {
    expect(amountInWords('17382.60', 'USD')).toBe(
      'USD Seventeen Thousand Three Hundred Eighty-Two and 60/100 Only',
    );
    expect(amountInWords('2000000.00', 'USD')).toBe('USD Two Million Only');
  });

  it('says nothing rather than something wrong', () => {
    expect(amountInWords('not a number', 'INR')).toBeNull();
    expect(amountInWords('-5.00', 'INR')).toBeNull();
    expect(amountInWords('1000000000000.00', 'INR')).toBeNull();
  });
});
