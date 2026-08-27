import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/services/api-client';
import { Page, SecondaryButton } from '@/components/admin/Page';
import { StatusBadge } from '@/components/admin/DataTable';
import { FormError } from '@/components/admin/Modal';
import { formatMoney } from '@/utils/format';
import { toast, toastFromError } from '@/components/Toasts';

interface CustomerDetail {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  isActive: boolean;
  acceptsMarketing: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  lastOrderAt: string | null;
  orderCount: number;
  reviewCount: number;
  totalSpent: string;
  addresses: {
    id: string;
    label: string | null;
    fullName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    isDefault: boolean;
  }[];
  orders: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    grandTotal: string;
    currency: string;
    placedAt: string;
  }[];
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-customer', id],
    queryFn: () => unwrap<CustomerDetail>(apiClient.get(`/customers/${id}`)),
    enabled: Boolean(id),
  });

  const toggleActive = useMutation({
    mutationFn: (isActive: boolean) =>
      unwrap(apiClient.patch(`/customers/${id}`, { isActive })),
    onError: (e) => toastFromError(e),
    onSuccess: (_data, isActive) => {
      toast.saved(isActive ? 'Customer reactivated' : 'Customer deactivated');
      queryClient.invalidateQueries({ queryKey: ['admin-customer', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
    },
  });

  if (query.isLoading) {
    return <Page title="Customer"><p className="text-sm text-ink-500">Loading…</p></Page>;
  }

  if (query.isError || !query.data) {
    return (
      <Page title="Customer">
        <p className="text-sm text-ink-700">That customer couldn't be loaded.</p>
        <Link to="/admin/customers" className="mt-3 inline-block text-sm underline">
          Back to customers
        </Link>
      </Page>
    );
  }

  const c = query.data;

  return (
    <Page
      title={`${c.firstName} ${c.lastName ?? ''}`.trim()}
      subtitle={c.email}
      back={{ to: '/admin/customers', label: 'All customers' }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Orders" value={String(c.orderCount)} />
        <Stat label="Total spent" value={formatMoney(c.totalSpent)} />
        <Stat label="Reviews written" value={String(c.reviewCount)} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <StatusBadge value={c.isActive ? 'active' : 'archived'} />
        {c.emailVerifiedAt ? (
          <span className="text-xs text-ink-500">Email verified</span>
        ) : (
          <span className="text-xs text-amber-700">Email not verified</span>
        )}
        {c.acceptsMarketing && (
          <span className="text-xs text-ink-500">Accepts marketing</span>
        )}
        <span className="text-xs text-ink-500">
          Joined {new Date(c.createdAt).toLocaleDateString()}
        </span>

        <SecondaryButton
          disabled={toggleActive.isPending}
          onClick={() => toggleActive.mutate(!c.isActive)}
        >
          {c.isActive ? 'Deactivate account' : 'Reactivate account'}
        </SecondaryButton>
      </div>

      {/* Deactivating blocks sign-in but keeps the order history, which the
          store still needs for its own accounts. */}
      {!c.isActive && (
        <p className="mt-3 text-sm text-ink-500">
          This customer cannot sign in. Their past orders are unaffected.
        </p>
      )}

      <FormError error={toggleActive.error} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="rounded-card border border-ink-100 bg-white">
          <h2 className="border-b border-ink-100 px-5 py-4 text-sm font-medium text-ink-950">
            Orders
          </h2>
          {c.orders.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-500">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-ink-50">
              {c.orders.map((o) => (
                <li key={o.id}>
                  <Link
                    to={`/admin/orders/${o.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-ink-50"
                  >
                    <span className="font-mono text-xs text-ink-900">{o.orderNumber}</span>
                    <span className="text-ink-500">
                      {new Date(o.placedAt).toLocaleDateString()}
                    </span>
                    <StatusBadge value={o.status} />
                    <span className="font-medium text-ink-950">
                      {formatMoney(o.grandTotal, o.currency)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-card border border-ink-100 bg-white p-5">
          <h2 className="text-sm font-medium text-ink-950">Saved addresses</h2>
          {c.addresses.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">
              None saved. Checkout addresses are stored on the order itself.
            </p>
          ) : (
            <ul className="mt-4 space-y-4 text-sm">
              {c.addresses.map((a) => (
                <li key={a.id}>
                  {a.isDefault && (
                    <span className="mb-1 block text-xs text-ink-500">Default</span>
                  )}
                  <address className="not-italic leading-relaxed text-ink-700">
                    {a.fullName}
                    <br />
                    {a.line1}
                    {a.line2 && (
                      <>
                        <br />
                        {a.line2}
                      </>
                    )}
                    <br />
                    {a.city}, {a.state} {a.postalCode}
                    <br />
                    {a.country}
                  </address>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-ink-100 bg-white p-5">
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-2 text-2xl font-medium tracking-tight text-ink-950">{value}</p>
    </div>
  );
}
