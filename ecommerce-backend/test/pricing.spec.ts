import { DiscountType } from '@prisma/client';
import { money } from '../src/common/money';
import {
  priceOrder,
  type CouponInput,
  type PricedLineInput,
  type ShippingInput,
} from '../src/orders/pricing';

const line = (over: Partial<PricedLineInput> = {}): PricedLineInput => ({
  productId: 'p1',
  variantId: null,
  productName: 'Widget',
  variantName: null,
  sku: 'SKU-1',
  unitPrice: money(100),
  taxRate: money(0),
  quantity: 1,
  categoryId: null,
  ...over,
});

const coupon = (over: Partial<CouponInput> = {}): CouponInput => ({
  id: 'c1',
  code: 'SAVE',
  discountType: DiscountType.PERCENTAGE,
  discountValue: money(10),
  maxDiscountAmount: null,
  productIds: [],
  categoryIds: [],
  ...over,
});

const shipping = (over: Partial<ShippingInput> = {}): ShippingInput => ({
  baseRate: money(50),
  perKgRate: money(0),
  freeAboveAmount: null,
  codFee: money(0),
  isCod: false,
  totalWeightKg: money(0),
  ...over,
});

describe('order pricing', () => {
  it('multiplies unit price by quantity', () => {
    const t = priceOrder([line({ unitPrice: money(249.5), quantity: 3 })], null, null);
    expect(t.subtotal.toFixed(2)).toBe('748.50');
    expect(t.grandTotal.toFixed(2)).toBe('748.50');
  });

  it('adds tax per line at that line\'s rate', () => {
    const t = priceOrder(
      [
        line({ unitPrice: money(100), taxRate: money(18) }),
        line({ productId: 'p2', unitPrice: money(100), taxRate: money(5) }),
      ],
      null,
      null,
    );
    expect(t.taxTotal.toFixed(2)).toBe('23.00');
    expect(t.grandTotal.toFixed(2)).toBe('223.00');
  });

  it('applies a percentage coupon', () => {
    const t = priceOrder([line({ unitPrice: money(1000) })], coupon(), null);
    expect(t.discountTotal.toFixed(2)).toBe('100.00');
    expect(t.grandTotal.toFixed(2)).toBe('900.00');
  });

  it('charges tax on the discounted amount, not the list price', () => {
    const t = priceOrder(
      [line({ unitPrice: money(1000), taxRate: money(18) })],
      coupon(),
      null,
    );
    // 1000 - 100 = 900, taxed at 18% = 162
    expect(t.taxTotal.toFixed(2)).toBe('162.00');
    expect(t.grandTotal.toFixed(2)).toBe('1062.00');
  });

  it('caps a percentage coupon at its maximum discount', () => {
    const t = priceOrder(
      [line({ unitPrice: money(10000) })],
      coupon({ discountValue: money(50), maxDiscountAmount: money(500) }),
      null,
    );
    expect(t.discountTotal.toFixed(2)).toBe('500.00');
  });

  it('never lets a fixed coupon exceed the goods and create credit', () => {
    const t = priceOrder(
      [line({ unitPrice: money(100) })],
      coupon({ discountType: DiscountType.FIXED, discountValue: money(500) }),
      null,
    );
    expect(t.discountTotal.toFixed(2)).toBe('100.00');
    expect(t.grandTotal.toFixed(2)).toBe('0.00');
    expect(t.grandTotal.isNegative()).toBe(false);
  });

  it('discounts only the products a scoped coupon covers', () => {
    const t = priceOrder(
      [
        line({ productId: 'shoes', unitPrice: money(1000) }),
        line({ productId: 'shirts', unitPrice: money(1000) }),
      ],
      coupon({ discountValue: money(50), productIds: ['shoes'] }),
      null,
    );
    expect(t.discountTotal.toFixed(2)).toBe('500.00');
    expect(t.lines[0].discount.toFixed(2)).toBe('500.00');
    expect(t.lines[1].discount.toFixed(2)).toBe('0.00');
  });

  it('honours a category-scoped coupon', () => {
    const t = priceOrder(
      [
        line({ productId: 'a', categoryId: 'sale', unitPrice: money(200) }),
        line({ productId: 'b', categoryId: 'full', unitPrice: money(200) }),
      ],
      coupon({ categoryIds: ['sale'] }),
      null,
    );
    expect(t.lines[0].discount.toFixed(2)).toBe('20.00');
    expect(t.lines[1].discount.toFixed(2)).toBe('0.00');
  });

  /**
   * The allocation must add up: a fixed coupon split across lines that do not
   * divide evenly is where a naive implementation loses or invents a paisa.
   */
  it('splits a fixed coupon across lines with no rounding drift', () => {
    const t = priceOrder(
      [
        line({ productId: 'a', unitPrice: money(33.33) }),
        line({ productId: 'b', unitPrice: money(33.33) }),
        line({ productId: 'c', unitPrice: money(33.34) }),
      ],
      coupon({ discountType: DiscountType.FIXED, discountValue: money(10) }),
      null,
    );

    const parts = t.lines.reduce((acc, l) => acc.add(l.discount), money(0));
    expect(parts.toFixed(2)).toBe('10.00');
    expect(t.discountTotal.toFixed(2)).toBe('10.00');
    expect(t.grandTotal.toFixed(2)).toBe('90.00');
  });

  it('adds a flat shipping rate', () => {
    const t = priceOrder([line({ unitPrice: money(500) })], null, shipping());
    expect(t.shippingTotal.toFixed(2)).toBe('50.00');
    expect(t.grandTotal.toFixed(2)).toBe('550.00');
  });

  it('charges by weight when the method does', () => {
    const t = priceOrder(
      [line({ unitPrice: money(500) })],
      null,
      shipping({ perKgRate: money(20), totalWeightKg: money(2.5) }),
    );
    expect(t.shippingTotal.toFixed(2)).toBe('100.00');
  });

  it('waives shipping above the free threshold', () => {
    const t = priceOrder(
      [line({ unitPrice: money(2000) })],
      null,
      shipping({ freeAboveAmount: money(1500) }),
    );
    expect(t.shippingTotal.toFixed(2)).toBe('0.00');
  });

  it('judges the free-shipping threshold after the discount', () => {
    // 2000 list, but a 50% coupon leaves 1000 — below the 1500 threshold.
    const t = priceOrder(
      [line({ unitPrice: money(2000) })],
      coupon({ discountValue: money(50) }),
      shipping({ freeAboveAmount: money(1500) }),
    );
    expect(t.shippingTotal.toFixed(2)).toBe('50.00');
  });

  it('adds the COD fee even when shipping itself is free', () => {
    const t = priceOrder(
      [line({ unitPrice: money(2000) })],
      null,
      shipping({ freeAboveAmount: money(1500), isCod: true, codFee: money(30) }),
    );
    expect(t.shippingTotal.toFixed(2)).toBe('30.00');
  });

  it('prices an empty order as zero rather than failing', () => {
    const t = priceOrder([], null, null);
    expect(t.grandTotal.toFixed(2)).toBe('0.00');
  });

  it('keeps line totals consistent with the order total', () => {
    const t = priceOrder(
      [
        line({ productId: 'a', unitPrice: money(199.99), quantity: 3, taxRate: money(18) }),
        line({ productId: 'b', unitPrice: money(49.5), quantity: 2, taxRate: money(5) }),
      ],
      coupon({ discountValue: money(15) }),
      shipping({ baseRate: money(75) }),
    );

    const fromLines = t.lines.reduce((acc, l) => acc.add(l.lineTotal), money(0));
    expect(fromLines.add(t.shippingTotal).toFixed(2)).toBe(t.grandTotal.toFixed(2));
  });
});
