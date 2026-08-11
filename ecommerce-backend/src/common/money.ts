import { Prisma } from '@prisma/client';

/**
 * Money is Decimal everywhere, never a JS number.
 *
 * `0.1 + 0.2` is 0.30000000000000004, and a store that computes totals in
 * floats will eventually charge a customer a paisa more than the line items
 * add up to. Prisma's Decimal is arbitrary precision, so the arithmetic here
 * is exact and only the final rounding is a decision.
 */
export type Money = Prisma.Decimal;

export const money = (value: Prisma.Decimal.Value): Money => new Prisma.Decimal(value);

export const ZERO = money(0);

/** Half-up to 2dp — the rounding a customer expects on an invoice. */
export function round2(value: Money): Money {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function sum(values: Money[]): Money {
  return values.reduce((total, value) => total.add(value), ZERO);
}

/** Clamps at zero: no line, and no order, may end up negative. */
export function floorAtZero(value: Money): Money {
  return value.isNegative() ? ZERO : value;
}

export function isPositive(value: Money): boolean {
  return value.greaterThan(0);
}
