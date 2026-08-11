import { Link, useLocation, useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useStore } from '@/features/theme/ThemeProvider';
import { formatMoney } from '@/utils/format';
import type { Order } from '@/types/api';

/**
 * Shown straight after checkout.
 *
 * The order arrives in router state because checkout already has it, which
 * avoids a refetch the shopper would see as a flash of loading. There is
 * deliberately no fallback fetch by order number for guests: that endpoint is
 * customer-scoped, and making it public would let anyone enumerate orders by
 * guessing numbers.
 */
export default function OrderConfirmation() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const store = useStore();
  const order = (useLocation().state as { order?: Order } | null)?.order ?? null;

  if (!order) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-xl text-ink-950">Order {orderNumber}</h1>
        <p className="mt-3 text-sm text-ink-500">
          Your order was placed. Sign in with the email you used to see its details and status.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm font-medium text-brand">
          Back to the shop
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-green-700">
          <Check size={18} />
        </span>
        <h1 className="font-display text-2xl tracking-tight text-ink-950">Order confirmed</h1>
      </div>

      {/* A confirmation is sent when the store has SMTP configured, and the
          attempt is recorded either way — so this says the order is recorded
          and the email is on its way, without guaranteeing delivery. */}
      <p className="mt-4 text-sm text-ink-700">
        Thank you. Your order is recorded and a confirmation is on its way to{' '}
        <span className="text-ink-950">{order.customerEmail}</span>.
      </p>

      <dl className="mt-8 grid gap-4 rounded-card border border-ink-100 p-6 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-ink-500">Order number</dt>
          <dd className="mt-1 font-medium text-ink-950">{order.orderNumber}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Status</dt>
          <dd className="mt-1 capitalize text-ink-950">{order.status.toLowerCase()}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Payment</dt>
          <dd className="mt-1 capitalize text-ink-950">
            {order.paymentStatus.toLowerCase().replace(/_/g, ' ')}
          </dd>
        </div>
        <div>
          <dt className="text-ink-500">Placed</dt>
          <dd className="mt-1 text-ink-950">
            {new Date(order.placedAt).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </dd>
        </div>
      </dl>

      <section className="mt-8">
        <h2 className="font-display text-base text-ink-950">What you ordered</h2>
        <ul className="mt-4 divide-y divide-ink-100 text-sm">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-4 py-3">
              <span className="min-w-0">
                <span className="text-ink-900">{item.productName}</span>
                {item.variantName && (
                  <span className="text-ink-500"> · {item.variantName}</span>
                )}
                <span className="block text-xs text-ink-500">
                  {item.quantity} × {formatMoney(item.unitPrice, order.currency)}
                </span>
              </span>
              <span className="whitespace-nowrap text-ink-950">
                {formatMoney(item.lineTotal, order.currency)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-2 border-t border-ink-100 pt-4 text-sm">
          <Row label="Subtotal" value={formatMoney(order.subtotal, order.currency)} />
          {Number(order.discountTotal) > 0 && (
            <Row
              label={order.couponCode ? `Discount (${order.couponCode})` : 'Discount'}
              value={`−${formatMoney(order.discountTotal, order.currency)}`}
            />
          )}
          <Row label="Tax" value={formatMoney(order.taxTotal, order.currency)} />
          <Row
            label="Shipping"
            value={
              Number(order.shippingTotal) === 0
                ? 'Free'
                : formatMoney(order.shippingTotal, order.currency)
            }
          />
          <div className="flex justify-between border-t border-ink-100 pt-3 font-medium text-ink-950">
            <dt>Total</dt>
            <dd>{formatMoney(order.grandTotal, order.currency)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-base text-ink-950">Delivering to</h2>
        <address className="mt-3 text-sm not-italic leading-relaxed text-ink-700">
          {order.shippingAddress.fullName}
          <br />
          {order.shippingAddress.line1}
          {order.shippingAddress.line2 && (
            <>
              <br />
              {order.shippingAddress.line2}
            </>
          )}
          <br />
          {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
          {order.shippingAddress.postalCode}
          <br />
          {order.shippingAddress.country}
        </address>
      </section>

      <Link
        to="/"
        className="mt-10 inline-block rounded-card bg-brand px-6 py-3 text-sm font-medium text-white"
      >
        Continue shopping
      </Link>

      <p className="mt-6 text-xs text-ink-500">
        Keep {order.orderNumber} handy if you need to contact {store.name} about this order.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-ink-900">{value}</dd>
    </div>
  );
}
