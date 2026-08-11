import { formatMoney } from '@/utils/format';
import type { CartTotals } from '@/types/api';

/**
 * The totals block, shared by the cart and checkout so the shopper sees the same
 * figures in the same order in both places. Every value comes from the server.
 */
export function OrderSummary({
  totals,
  currency,
  couponCode,
  shippingChosen = true,
  children,
}: {
  totals: CartTotals;
  currency: string;
  couponCode?: string | null;
  /** False before a shipping method is picked, so 0 does not read as "free". */
  shippingChosen?: boolean;
  children?: React.ReactNode;
}) {
  const hasDiscount = Number(totals.discountTotal) > 0;

  return (
    <div className="rounded-card border border-ink-100 p-6">
      <h2 className="font-display text-base text-ink-950">Order summary</h2>

      <dl className="mt-5 space-y-3 text-sm">
        <Row label="Subtotal" value={formatMoney(totals.subtotal, currency)} />

        {hasDiscount && (
          <Row
            label={couponCode ? `Discount (${couponCode})` : 'Discount'}
            value={`−${formatMoney(totals.discountTotal, currency)}`}
            accent
          />
        )}

        <Row label="Tax" value={formatMoney(totals.taxTotal, currency)} />

        <Row
          label="Shipping"
          value={
            !shippingChosen
              ? 'Calculated at checkout'
              : Number(totals.shippingTotal) === 0
                ? 'Free'
                : formatMoney(totals.shippingTotal, currency)
          }
          muted={!shippingChosen}
        />
      </dl>

      <div className="mt-5 flex items-baseline justify-between border-t border-ink-100 pt-5">
        <span className="text-sm font-medium text-ink-950">Total</span>
        <span className="text-lg font-medium text-ink-950">
          {formatMoney(totals.grandTotal, currency)}
        </span>
      </div>

      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}

function Row({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-ink-500">{label}</dt>
      <dd
        className={
          accent ? 'text-green-700' : muted ? 'text-xs text-ink-500' : 'text-ink-900'
        }
      >
        {value}
      </dd>
    </div>
  );
}
