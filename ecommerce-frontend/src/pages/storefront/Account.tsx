import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customerService } from '@/services/customer.service';
import { useCustomerStore } from '@/store/customer.store';
import { useStore } from '@/features/theme/ThemeProvider';
import { formatMoney } from '@/utils/format';
import type { Order } from '@/types/api';

/** Statuses a customer may still call off themselves; the server agrees. */
const CANCELLABLE = ['PENDING', 'CONFIRMED'];

export default function Account() {
  const store = useStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { customer, status, signOut } = useCustomerStore();
  const [page, setPage] = useState(1);

  const orders = useQuery({
    queryKey: ['my-orders', page],
    queryFn: () => customerService.myOrders({ page, limit: 10 }),
    enabled: status === 'authenticated',
    placeholderData: (previous) => previous,
  });

  const cancel = useMutation({
    mutationFn: (orderNumber: string) => customerService.cancelMyOrder(orderNumber),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-orders'] }),
  });

  if (status === 'idle' || status === 'loading') {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-sm text-ink-500">Loading…</div>;
  }

  if (status === 'guest' || !customer) {
    return <Navigate to="/account/sign-in?next=/account" replace />;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-ink-950">
            {customer.firstName}
          </h1>
          <p className="mt-1 text-sm text-ink-500">{customer.email}</p>
        </div>
        <button
          onClick={async () => {
            await signOut();
            navigate('/');
          }}
          className="text-sm text-ink-500 underline hover:text-ink-900"
        >
          Sign out
        </button>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-base text-ink-950">Your orders</h2>

        {orders.isLoading && <p className="mt-4 text-sm text-ink-500">Loading orders…</p>}

        {orders.data?.items.length === 0 && (
          <div className="mt-4 rounded-card border border-dashed border-ink-300 p-12 text-center">
            <p className="text-sm text-ink-700">No orders yet</p>
            <Link to="/shop" className="mt-3 inline-block text-sm font-medium text-brand">
              Start shopping
            </Link>
          </div>
        )}

        <ul className="mt-4 space-y-4">
          {orders.data?.items.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              currency={store.currency}
              canCancel={CANCELLABLE.includes(order.status)}
              cancelling={cancel.isPending && cancel.variables === order.orderNumber}
              onCancel={() => cancel.mutate(order.orderNumber)}
            />
          ))}
        </ul>

        {cancel.isError && (
          <p className="mt-3 text-sm text-red-600">
            {(cancel.error as { message?: string }).message}
          </p>
        )}

        {orders.data?.meta && orders.data.meta.totalPages > 1 && (
          <div className="mt-6 flex justify-between text-sm">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-card border border-ink-300 px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={!orders.data.meta.hasNext}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-card border border-ink-300 px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function OrderCard({
  order,
  currency,
  canCancel,
  cancelling,
  onCancel,
}: {
  order: Order;
  currency: string;
  canCancel: boolean;
  cancelling: boolean;
  onCancel: () => void;
}) {
  return (
    <li className="rounded-card border border-ink-100 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-ink-500">{order.orderNumber}</p>
          <p className="mt-1 text-sm text-ink-900">
            {new Date(order.placedAt).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-ink-950">
            {formatMoney(order.grandTotal, currency)}
          </p>
          <p className="mt-0.5 text-xs capitalize text-ink-500">
            {order.status.toLowerCase()} · {order.paymentStatus.toLowerCase().replace(/_/g, ' ')}
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-1 text-sm text-ink-700">
        {order.items.map((item) => (
          <li key={item.id}>
            {item.quantity} × {item.productName}
            {item.variantName && <span className="text-ink-500"> · {item.variantName}</span>}
          </li>
        ))}
      </ul>

      {canCancel && (
        <button
          onClick={onCancel}
          disabled={cancelling}
          className="mt-4 text-xs text-red-600 underline disabled:opacity-40"
        >
          {cancelling ? 'Cancelling…' : 'Cancel this order'}
        </button>
      )}
    </li>
  );
}
