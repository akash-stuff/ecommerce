import { orderPlacedSms, orderStatusSms } from '../src/notifications/sms-templates';
import type { OrderEmailData, StatusEmailData } from '../src/notifications/templates';

const order = (overrides: Partial<OrderEmailData> = {}): OrderEmailData => ({
  storeName: 'Northwind',
  storeEmail: 'hello@northwind.test',
  brandColor: '#111111',
  orderNumber: 'NW-1042',
  customerName: 'Asha',
  currency: 'INR',
  items: [],
  subtotal: '1000.00',
  discountTotal: '0.00',
  taxTotal: '180.00',
  shippingTotal: '0.00',
  grandTotal: '1180.00',
  shippingAddress: {
    fullName: 'Asha', line1: '1 Road', city: 'Pune',
    state: 'MH', postalCode: '411001', country: 'IN',
  },
  paymentMethod: 'Cash on delivery',
  ...overrides,
});

const status = (overrides: Partial<StatusEmailData> = {}): StatusEmailData => ({
  storeName: 'Northwind',
  storeEmail: 'hello@northwind.test',
  orderNumber: 'NW-1042',
  customerName: 'Asha',
  status: 'SHIPPED',
  ...overrides,
});

describe('order confirmation text message', () => {
  it('carries the order number and the total', () => {
    const message = orderPlacedSms(order());

    expect(message).toContain('NW-1042');
    expect(message).toContain('1180.00');
    expect(message).toContain('Northwind');
  });

  /**
   * SMS is billed per 160-character segment, so an unbounded store name or a
   * long customer name must not silently turn one message into four.
   */
  it('stays within a couple of segments however long the inputs are', () => {
    const message = orderPlacedSms(
      order({ storeName: 'A'.repeat(400), customerName: 'B'.repeat(400) }),
    );

    expect(message.length).toBeLessThanOrEqual(320);
    expect(message.endsWith('…')).toBe(true);
  });

  /**
   * Nothing renders this as markup, so escaping would put `&amp;` in front of a
   * customer rather than protect them.
   */
  it('does not HTML-escape, because nothing renders it as HTML', () => {
    const message = orderPlacedSms(order({ storeName: 'Tom & Jerry' }));

    expect(message).toContain('Tom & Jerry');
    expect(message).not.toContain('&amp;');
  });
});

describe('order status text message', () => {
  it('writes a message for the statuses a customer cares about', () => {
    expect(orderStatusSms(status({ status: 'SHIPPED' }))).toContain('has shipped');
    expect(orderStatusSms(status({ status: 'DELIVERED' }))).toContain('delivered');
    expect(orderStatusSms(status({ status: 'REFUNDED' }))).toContain('refunded');
  });

  it('includes the reason a cancellation was given', () => {
    const message = orderStatusSms(status({ status: 'CANCELLED', reason: 'Out of stock' }));

    expect(message).toContain('cancelled');
    expect(message).toContain('Out of stock');
  });

  /**
   * Texting someone about internal bookkeeping is how a store's messages get
   * muted, which then costs it the delivery notice that mattered.
   */
  it('stays silent for statuses not worth a text', () => {
    expect(orderStatusSms(status({ status: 'CONFIRMED' }))).toBeNull();
    expect(orderStatusSms(status({ status: 'PROCESSING' }))).toBeNull();
    expect(orderStatusSms(status({ status: 'PACKED' }))).toBeNull();
    expect(orderStatusSms(status({ status: 'PENDING' }))).toBeNull();
  });
});
