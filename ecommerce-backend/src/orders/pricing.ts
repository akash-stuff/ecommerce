import { DiscountType } from '@prisma/client';
import { floorAtZero, money, Money, round2, sum, ZERO } from '../common/money';

/**
 * Server-side total calculation.
 *
 * Development rule 9: never trust a price from the frontend. Every input here
 * comes from the database — unit prices and tax rates are read from Product and
 * ProductVariant rows, the discount comes from a Coupon row already validated
 * against this cart, and the shipping rate comes from a ShippingMethod row. The
 * client contributes quantities and ids, nothing that costs money.
 *
 * Kept as pure functions so the arithmetic can be tested without a database,
 * which matters more here than anywhere else in the codebase.
 */

export interface PricedLineInput {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  sku: string;
  /** From the DB row, never from the request. */
  unitPrice: Money;
  /** Percentage, e.g. 18 for 18% GST. */
  taxRate: Money;
  quantity: number;
  categoryId: string | null;
}

export interface CouponInput {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: Money;
  maxDiscountAmount: Money | null;
  /** Empty means "applies to everything". */
  productIds: string[];
  categoryIds: string[];
}

export interface ShippingInput {
  baseRate: Money;
  perKgRate: Money;
  freeAboveAmount: Money | null;
  codFee: Money;
  isCod: boolean;
  totalWeightKg: Money;
}

export interface PricedLine extends PricedLineInput {
  lineSubtotal: Money;
  discount: Money;
  tax: Money;
  lineTotal: Money;
}

export interface OrderTotals {
  lines: PricedLine[];
  subtotal: Money;
  discountTotal: Money;
  taxTotal: Money;
  shippingTotal: Money;
  grandTotal: Money;
}

export function priceOrder(
  lineInputs: PricedLineInput[],
  coupon: CouponInput | null,
  shipping: ShippingInput | null,
): OrderTotals {
  const subtotals = lineInputs.map((line) =>
    round2(line.unitPrice.mul(line.quantity)),
  );
  const subtotal = round2(sum(subtotals));

  const discounts = allocateDiscount(lineInputs, subtotals, coupon);
  const discountTotal = round2(sum(discounts));

  // Tax is charged on what the customer actually pays for the goods, so it is
  // computed after the discount rather than on the list price.
  const taxes = lineInputs.map((line, i) =>
    round2(subtotals[i].sub(discounts[i]).mul(line.taxRate).div(100)),
  );
  const taxTotal = round2(sum(taxes));

  const shippingTotal = shipping
    ? priceShipping(shipping, subtotal.sub(discountTotal))
    : ZERO;

  const lines: PricedLine[] = lineInputs.map((line, i) => ({
    ...line,
    lineSubtotal: subtotals[i],
    discount: discounts[i],
    tax: taxes[i],
    lineTotal: round2(subtotals[i].sub(discounts[i]).add(taxes[i])),
  }));

  return {
    lines,
    subtotal,
    discountTotal,
    taxTotal,
    shippingTotal,
    grandTotal: round2(
      subtotal.sub(discountTotal).add(taxTotal).add(shippingTotal),
    ),
  };
}

/**
 * Spreads a coupon across the lines it applies to.
 *
 * A coupon restricted to certain products or categories may only discount those
 * lines, so the discount is allocated per line rather than subtracted from the
 * order total — otherwise a 50%-off-shoes coupon would quietly discount the
 * shirts too. A fixed-amount coupon is split in proportion to each eligible
 * line's value, with the rounding remainder pushed onto the last line so the
 * parts always add up to the whole.
 */
function allocateDiscount(
  lines: PricedLineInput[],
  subtotals: Money[],
  coupon: CouponInput | null,
): Money[] {
  if (!coupon) return lines.map(() => ZERO);

  const eligible = lines.map((line) => isEligible(line, coupon));
  const eligibleTotal = round2(
    sum(subtotals.filter((_, i) => eligible[i])),
  );

  if (!eligibleTotal.greaterThan(0)) return lines.map(() => ZERO);

  let discountPool =
    coupon.discountType === DiscountType.PERCENTAGE
      ? round2(eligibleTotal.mul(coupon.discountValue).div(100))
      : money(coupon.discountValue);

  // A fixed coupon larger than the eligible goods must not create credit.
  if (discountPool.greaterThan(eligibleTotal)) discountPool = eligibleTotal;

  if (coupon.maxDiscountAmount && discountPool.greaterThan(coupon.maxDiscountAmount)) {
    discountPool = money(coupon.maxDiscountAmount);
  }

  const lastEligible = eligible.lastIndexOf(true);
  let allocated = ZERO;

  return lines.map((_, i) => {
    if (!eligible[i]) return ZERO;

    if (i === lastEligible) {
      // Absorb the rounding remainder so the parts sum to discountPool exactly.
      return floorAtZero(round2(discountPool.sub(allocated)));
    }

    const share = round2(discountPool.mul(subtotals[i]).div(eligibleTotal));
    allocated = allocated.add(share);
    return share;
  });
}

function isEligible(line: PricedLineInput, coupon: CouponInput): boolean {
  const productScoped = coupon.productIds.length > 0;
  const categoryScoped = coupon.categoryIds.length > 0;

  if (!productScoped && !categoryScoped) return true;
  if (productScoped && coupon.productIds.includes(line.productId)) return true;
  if (categoryScoped && line.categoryId && coupon.categoryIds.includes(line.categoryId)) {
    return true;
  }
  return false;
}

/**
 * Free-shipping thresholds are judged on the discounted goods total, not the
 * list price — a customer who only reaches the threshold because of a coupon
 * has not actually spent that much.
 */
function priceShipping(shipping: ShippingInput, goodsTotal: Money): Money {
  const cod = shipping.isCod ? money(shipping.codFee) : ZERO;

  if (shipping.freeAboveAmount && goodsTotal.greaterThanOrEqualTo(shipping.freeAboveAmount)) {
    return round2(cod);
  }

  const weightCharge = round2(shipping.perKgRate.mul(shipping.totalWeightKg));
  return round2(money(shipping.baseRate).add(weightCharge).add(cod));
}
