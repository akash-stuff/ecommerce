import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/services/api-client';
import { invoiceService, orderService } from '@/services/admin.service';
import { filenameFromDisposition, saveBlob } from '@/utils/download';
import { Page, PrimaryButton, SecondaryButton } from '@/components/admin/Page';
import { StatusBadge } from '@/components/admin/DataTable';
import { Field, FormError, Input, Modal, Textarea } from '@/components/admin/Modal';
import { formatMoney } from '@/utils/format';
import { toast, toastFromError } from '@/components/Toasts';

/**
 * Mirrors the server's transition table. The server is still the authority — it
 * returns INVALID_STATUS_TRANSITION either way — but offering only the moves
 * that can succeed is kinder than a button that always errors.
 */
interface Shipment {
  id: string;
  provider: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string;
  shippedAt: string | null;
  deliveredAt: string | null;
}

const NEXT_STATUS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');

  const query = useQuery({
    queryKey: ['admin-order', id],
    queryFn: () => orderService.get(id!),
    enabled: Boolean(id),
  });

  /**
   * The same PDF the customer downloads, from the same renderer — so a shop
   * answering "what does my invoice say" is looking at the document the shopper
   * has, not an admin-only approximation of it.
   */
  const invoice = useMutation({
    onError: (e) => toastFromError(e, 'That invoice could not be downloaded.'),
    mutationFn: () => invoiceService.download(id!),
    onSuccess: ({ blob, disposition }) =>
      saveBlob(blob, filenameFromDisposition(disposition, `invoice-${id}.pdf`)),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-order', id] });
    queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
  };

  const advance = useMutation({
    // Failures pop in the corner like everything else, so a
    // rejected save cannot be mistaken for a quiet success.
    onError: (e) => toastFromError(e),
    mutationFn: (status: string) => orderService.setStatus(id!, status),
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    // Failures pop in the corner like everything else, so a
    // rejected save cannot be mistaken for a quiet success.
    onError: (e) => toastFromError(e),
    mutationFn: () => orderService.setStatus(id!, 'CANCELLED', reason || undefined),
    onSuccess: () => {
      toast.saved('Order cancelled');
      setCancelling(false);
      setReason('');
      invalidate();
    },
  });

  const shipments = useQuery({
    queryKey: ['order-shipments', id],
    queryFn: () =>
      unwrap<Shipment[]>(apiClient.get(`/orders/${id}/shipments`)),
    enabled: Boolean(id),
  });

  const dispatchParcel = useMutation({
    mutationFn: () =>
      unwrap<Shipment>(
        apiClient.post(`/orders/${id}/shipments`, {
          provider: carrier || undefined,
          trackingNumber: tracking || undefined,
          trackingUrl: trackingUrl || undefined,
        }),
      ),
    onSuccess: () => {
      setDispatching(false);
      setCarrier('');
      setTracking('');
      setTrackingUrl('');
      queryClient.invalidateQueries({ queryKey: ['order-shipments', id] });
      invalidate();
    },
  });

  const collect = useMutation({
    // Failures pop in the corner like everything else, so a
    // rejected save cannot be mistaken for a quiet success.
    onError: (e) => toastFromError(e),
    mutationFn: () => orderService.markCollected(id!),
    onSuccess: invalidate,
  });

  if (query.isLoading) {
    return <Page title="Order"><p className="text-sm text-ink-500">Loading…</p></Page>;
  }

  if (query.isError || !query.data) {
    return (
      <Page title="Order">
        <p className="text-sm text-ink-700">That order couldn't be loaded.</p>
        <Link to="/admin/orders" className="mt-3 inline-block text-sm underline">
          Back to orders
        </Link>
      </Page>
    );
  }

  const order = query.data;
  const moves = NEXT_STATUS[order.status] ?? [];
  const forward = moves.filter((m) => m !== 'CANCELLED');
  const canCancel = moves.includes('CANCELLED');
  const codOutstanding =
    order.paymentStatus !== 'PAID' && order.payments.some((p) => p.provider === 'COD');

  return (
    <Page
      title={order.orderNumber}
      subtitle={`Placed ${new Date(order.placedAt).toLocaleString()} · ${order.customerEmail}`}
      back={{ to: '/admin/orders', label: 'All orders' }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge value={order.status} />
        <StatusBadge value={order.paymentStatus} />
        {order.cancelReason && (
          <span className="text-sm text-ink-500">Reason: {order.cancelReason}</span>
        )}
      </div>

      {/* Fulfilment is the whole job on this screen, so the actions sit first. */}
      <div className="mt-5 flex flex-wrap gap-3">
        {forward.map((status) => (
          <PrimaryButton
            key={status}
            disabled={advance.isPending}
            onClick={() => advance.mutate(status)}
          >
            Mark {status.toLowerCase()}
          </PrimaryButton>
        ))}

        {['CONFIRMED', 'PROCESSING', 'PACKED'].includes(order.status) && (
          <SecondaryButton onClick={() => setDispatching(true)}>
            Record dispatch
          </SecondaryButton>
        )}

        {codOutstanding && (
          <SecondaryButton disabled={collect.isPending} onClick={() => collect.mutate()}>
            Record cash collected
          </SecondaryButton>
        )}

        <SecondaryButton disabled={invoice.isPending} onClick={() => invoice.mutate()}>
          {invoice.isPending ? 'Preparing…' : 'Download invoice'}
        </SecondaryButton>

        {canCancel && (
          <button
            onClick={() => setCancelling(true)}
            className="rounded-card border border-red-200 px-3 py-1.5 text-sm text-red-700"
          >
            Cancel order
          </button>
        )}

        {moves.length === 0 && (
          <p className="text-sm text-ink-500">
            This order is {order.status.toLowerCase()} and cannot move further.
          </p>
        )}
      </div>

      <FormError error={advance.error ?? collect.error} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="rounded-card border border-ink-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Unit</th>
                <th className="px-4 py-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b border-ink-50 last:border-0">
                  <td className="px-4 py-3">
                    <span className="text-ink-900">{item.productName}</span>
                    {item.variantName && (
                      <span className="text-ink-500"> · {item.variantName}</span>
                    )}
                    <span className="block font-mono text-xs text-ink-500">{item.sku}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-700">{item.quantity}</td>
                  <td className="px-4 py-3 text-ink-700">
                    {formatMoney(item.unitPrice, order.currency)}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink-950">
                    {formatMoney(item.lineTotal, order.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-6">
          <section className="rounded-card border border-ink-100 bg-white p-5">
            <h2 className="text-sm font-medium text-ink-950">Totals</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="Subtotal" value={formatMoney(order.subtotal, order.currency)} />
              {Number(order.discountTotal) > 0 && (
                <Row
                  label={order.couponCode ? `Discount (${order.couponCode})` : 'Discount'}
                  value={`−${formatMoney(order.discountTotal, order.currency)}`}
                />
              )}
              <Row label="Tax" value={formatMoney(order.taxTotal, order.currency)} />
              <Row label="Shipping" value={formatMoney(order.shippingTotal, order.currency)} />
              <div className="flex justify-between border-t border-ink-100 pt-2 font-medium text-ink-950">
                <dt>Total</dt>
                <dd>{formatMoney(order.grandTotal, order.currency)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-card border border-ink-100 bg-white p-5">
            <h2 className="text-sm font-medium text-ink-950">Delivering to</h2>
            <address className="mt-2 text-sm not-italic leading-relaxed text-ink-700">
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
              {order.customerPhone && (
                <>
                  <br />
                  {order.customerPhone}
                </>
              )}
            </address>
          </section>

          <section className="rounded-card border border-ink-100 bg-white p-5">
            <h2 className="text-sm font-medium text-ink-950">Parcels</h2>
            {(shipments.data ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">Nothing dispatched yet.</p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm">
                {shipments.data!.map((s) => (
                  <li key={s.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ink-900">{s.provider}</span>
                      <StatusBadge value={s.status} />
                    </div>
                    {s.trackingNumber && (
                      <p className="mt-0.5 font-mono text-xs text-ink-500">{s.trackingNumber}</p>
                    )}
                    {s.trackingUrl && (
                      <a
                        href={s.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs underline"
                      >
                        Track parcel
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-card border border-ink-100 bg-white p-5">
            <h2 className="text-sm font-medium text-ink-950">Payments</h2>
            {order.payments.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">No payment attempts recorded.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {order.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span className="text-ink-700">{p.provider}</span>
                    <StatusBadge value={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {order.notes && (
            <section className="rounded-card border border-ink-100 bg-white p-5">
              <h2 className="text-sm font-medium text-ink-950">Customer note</h2>
              <p className="mt-2 text-sm text-ink-700">{order.notes}</p>
            </section>
          )}
        </div>
      </div>

      {dispatching && (
        <Modal
          title="Record a dispatch"
          onClose={() => setDispatching(false)}
          footer={
            <>
              <SecondaryButton onClick={() => setDispatching(false)}>Cancel</SecondaryButton>
              <PrimaryButton
                disabled={dispatchParcel.isPending}
                onClick={() => dispatchParcel.mutate()}
              >
                {dispatchParcel.isPending ? 'Saving…' : 'Mark shipped'}
              </PrimaryButton>
            </>
          }
        >
          <p className="text-sm text-ink-700">
            This marks the order shipped and emails the customer their tracking details.
          </p>
          <div className="mt-4 space-y-4">
            <Field label="Carrier" hint="Whoever is carrying the parcel">
              <Input
                value={carrier}
                placeholder="Delhivery"
                onChange={(e) => setCarrier(e.target.value)}
              />
            </Field>
            <Field label="Tracking number">
              <Input value={tracking} onChange={(e) => setTracking(e.target.value)} />
            </Field>
            <Field label="Tracking URL" hint="Optional; included in the email">
              <Input
                value={trackingUrl}
                placeholder="https://…"
                onChange={(e) => setTrackingUrl(e.target.value)}
              />
            </Field>
          </div>
          <FormError error={dispatchParcel.error} />
        </Modal>
      )}

      {cancelling && (
        <Modal
          title="Cancel this order?"
          onClose={() => setCancelling(false)}
          footer={
            <>
              <SecondaryButton onClick={() => setCancelling(false)}>Keep it</SecondaryButton>
              <button
                onClick={() => cancel.mutate()}
                disabled={cancel.isPending}
                className="rounded-card bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {cancel.isPending ? 'Cancelling…' : 'Cancel order'}
              </button>
            </>
          }
        >
          <p className="text-sm text-ink-700">
            The items go back into stock and any coupon the customer used is released. This cannot
            be undone.
          </p>
          <div className="mt-4">
            <Field label="Reason (optional, shown on the order)">
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
          <FormError error={cancel.error} />
        </Modal>
      )}
    </Page>
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
