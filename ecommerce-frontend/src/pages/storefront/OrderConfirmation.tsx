import { Link, useLocation, useParams } from 'react-router-dom';
import { Spinner } from '@/components/Spinner';
import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { SuccessTick } from '@/features/checkout/OrderPlaced';
import { useStore } from '@/features/theme/ThemeProvider';
import { useCustomerStore } from '@/store/customer.store';
import { customerService } from '@/services/customer.service';
import { filenameFromDisposition, saveBlob } from '@/utils/download';
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
  const customer = useCustomerStore((s) => s.customer);
  const order = (useLocation().state as { order?: Order } | null)?.order ?? null;

  /**
   * The invoice route is scoped to the signed-in customer, which is what stops
   * one shopper downloading another's — order numbers are sequential and
   * guessable. A guest checkout has no account to scope to, so the button is
   * only offered when there is one, and guests are told what to do instead.
   */
  const invoice = useMutation({
    mutationFn: (number: string) => customerService.downloadInvoice(number),
    onSuccess: ({ blob, disposition }, number) =>
      saveBlob(blob, filenameFromDisposition(disposition, `invoice-${number}.pdf`)),
  });

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
      {/* The same mark as the overlay that preceded this page, so arriving here
          reads as continuous rather than as a different screen with a different
          idea of what a confirmation looks like. */}
      <div className="flex items-center gap-3">
        <span className="text-emerald-600">
          <SuccessTick size={36} />
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

      {/* `items-stretch`, for the reason in ProductDetail: "Continue shopping"
          is filled and "Download invoice" is outlined, so their heights differ
          by the border alone. */}
      <div className="mt-10 flex flex-wrap items-stretch gap-3">
        <Link
          to="/"
          className="inline-flex items-center rounded-card bg-brand px-6 py-3 text-sm font-medium text-white"
        >
          Continue shopping
        </Link>

        {customer && (
          <button
            type="button"
            onClick={() => invoice.mutate(order.orderNumber)}
            disabled={invoice.isPending}
            className="inline-flex items-center gap-2 rounded-card border border-ink-900 px-6 py-3 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50 disabled:opacity-40"
          >
            {invoice.isPending ? (
              <Spinner size={14} tone="current" />
            ) : (
              <Download size={14} />
            )}
            {invoice.isPending ? 'Preparing…' : 'Download invoice'}
          </button>
        )}
      </div>

      {invoice.isError && (
        <p className="mt-3 text-sm text-red-600">
          {(invoice.error as { message?: string }).message ??
            'That invoice could not be downloaded.'}
        </p>
      )}

      {!customer && (
        <p className="mt-4 text-sm text-ink-500">
          Sign in with {order.customerEmail} to download an invoice for this order.
        </p>
      )}

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
