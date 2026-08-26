import {
  customerWelcome,
  escapeHtml,
  orderConfirmation,
  orderStatusChanged,
  type OrderEmailData,
} from '../src/notifications/templates';


const data = (over: Partial<OrderEmailData> = {}): OrderEmailData => ({
  storeName: 'Northwind',
  storeEmail: 'help@northwind.test',
  brandColor: '#141414',
  orderNumber: 'ORD-20260101-ABC123',
  customerName: 'Asha Rao',
  currency: 'INR',
  items: [{ name: 'Wool Scarf', variantName: null, quantity: 2, lineTotal: '3800.00' }],
  subtotal: '3800.00',
  discountTotal: '0.00',
  taxTotal: '684.00',
  shippingTotal: '0.00',
  grandTotal: '4484.00',
  shippingAddress: {
    fullName: 'Asha Rao',
    line1: '12 Marine Drive',
    line2: null,
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400001',
    country: 'IN',
  },
  paymentMethod: 'Cash on delivery',
  ...over,
});

describe('escapeHtml', () => {
  it('neutralises the characters that open a tag or attribute', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
    expect(escapeHtml("O'Brien & Sons")).toBe('O&#39;Brien &amp; Sons');
  });
});

describe('order confirmation email', () => {
  it('names the store and the order in the subject', () => {
    const mail = orderConfirmation(data());
    expect(mail.subject).toContain('Northwind');
    expect(mail.subject).toContain('ORD-20260101-ABC123');
  });

  /**
   * The merchant confirms moments after the order is placed, so the customer
   * gets both. Identical subjects would read as a duplicate, not two steps.
   */
  it('does not share a subject with the CONFIRMED status email', () => {
    const placed = orderConfirmation(data());
    const confirmed = orderStatusChanged({
      storeName: 'Northwind',
      storeEmail: 'help@northwind.test',
      orderNumber: 'ORD-20260101-ABC123',
      customerName: 'Asha Rao',
      status: 'CONFIRMED',
    });

    expect(placed.subject).not.toBe(confirmed.subject);
  });

  it('formats money in the order currency', () => {
    const mail = orderConfirmation(data());
    expect(mail.text).toContain('₹4,484.00');
    expect(mail.html).toContain('₹4,484.00');
  });

  /**
   * A product name is whatever someone typed into the admin, and a shipping
   * address is whatever a shopper typed at checkout. Both land in an HTML email.
   */
  it('escapes a product name containing markup', () => {
    const mail = orderConfirmation(
      data({
        items: [
          {
            name: '<img src=x onerror=alert(1)>',
            variantName: null,
            quantity: 1,
            lineTotal: '10.00',
          },
        ],
      }),
    );

    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).toContain('&lt;img src=x');
  });

  it('escapes an address containing markup', () => {
    const mail = orderConfirmation(
      data({
        shippingAddress: { ...data().shippingAddress, line1: '</p><script>bad()</script>' },
      }),
    );

    expect(mail.html).not.toContain('<script>bad()');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('shows a discount line only when there is a discount', () => {
    expect(orderConfirmation(data()).text).not.toContain('Discount');
    expect(orderConfirmation(data({ discountTotal: '700.00' })).text).toContain('Discount');
  });

  it('says "Free" rather than a zero amount for free shipping', () => {
    expect(orderConfirmation(data()).text).toContain('Shipping: Free');
  });

  it('always produces a plain-text alternative', () => {
    const mail = orderConfirmation(data());
    expect(mail.text.length).toBeGreaterThan(50);
    expect(mail.text).not.toContain('<');
  });
});

describe('status change email', () => {
  it('uses wording a person would write', () => {
    const shipped = orderStatusChanged({
      storeName: 'Northwind',
      storeEmail: 'help@northwind.test',
      orderNumber: 'ORD-1',
      customerName: 'Asha',
      status: 'SHIPPED',
    });

    expect(shipped.subject).toContain('on its way');
    expect(shipped.text).toContain('handed to the carrier');
  });

  it('includes a cancellation reason when there is one', () => {
    const mail = orderStatusChanged({
      storeName: 'Northwind',
      storeEmail: 'help@northwind.test',
      orderNumber: 'ORD-1',
      customerName: 'Asha',
      status: 'CANCELLED',
      reason: 'Out of stock',
    });

    expect(mail.text).toContain('Out of stock');
  });

  it('falls back readably for a status it has no copy for', () => {
    const mail = orderStatusChanged({
      storeName: 'Northwind',
      storeEmail: 'help@northwind.test',
      orderNumber: 'ORD-1',
      customerName: 'Asha',
      status: 'PARTIALLY_REFUNDED',
    });

    expect(mail.subject).toBeTruthy();
    expect(mail.text).toContain('partially_refunded');
  });
});

describe('welcome email', () => {
  it('greets the customer by name and escapes it', () => {
    const mail = customerWelcome({
      storeName: 'Northwind',
      storeEmail: 'help@northwind.test',
      customerName: '<b>Meera</b>',
    });

    expect(mail.html).toContain('&lt;b&gt;Meera&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>Meera</b>');
  });
});
