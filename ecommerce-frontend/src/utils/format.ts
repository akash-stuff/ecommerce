/** Prices arrive as decimal strings so precision survives the wire. */
export function formatMoney(amount: string | number, currency = 'INR', locale = 'en-IN'): string {
  const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(value: string | Date, locale = 'en-IN'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(value));
}
