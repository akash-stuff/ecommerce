import { describe, expect, it } from 'vitest';
import { formatMoney } from './format';

describe('formatMoney', () => {
  it('formats a decimal string without losing precision on the wire', () => {
    expect(formatMoney('1900', 'INR')).toBe('₹1,900.00');
  });

  it('follows the store currency rather than a compiled-in default', () => {
    expect(formatMoney('1900', 'USD', 'en-US')).toBe('$1,900.00');
  });

  it('renders a dash instead of NaN for an unparseable amount', () => {
    expect(formatMoney('not-a-number')).toBe('—');
  });

  it('accepts a number as well as a string', () => {
    expect(formatMoney(0, 'INR')).toBe('₹0.00');
  });
});
