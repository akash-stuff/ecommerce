import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { platformService } from '@/services/platform.service';
import { Page } from '@/components/admin/Page';
import { formatMoney } from '@/utils/format';

const RANGES = [7, 30, 90];

export default function PlatformOverview() {
  const [days, setDays] = useState(30);

  const query = useQuery({
    queryKey: ['platform-overview', days],
    queryFn: () => platformService.overview(days),
    placeholderData: (previous) => previous,
  });

  const data = query.data;

  return (
    <Page
      title="Platform"
      subtitle="Every store on this installation"
      action={
        <div className="flex gap-1 rounded-card border border-ink-100 bg-white p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={`rounded px-3 py-1 text-sm ${
                days === r ? 'bg-ink-950 text-white' : 'text-ink-700 hover:bg-ink-50'
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      }
    >
      {query.isLoading && <p className="text-sm text-ink-500">Loading…</p>}

      {query.isError && (
        <div className="rounded-card border border-ink-100 bg-white p-8 text-center">
          <p className="text-sm text-ink-700">The overview couldn't be loaded.</p>
          <button onClick={() => query.refetch()} className="mt-2 text-sm underline">
            Try again
          </button>
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Stores" value={String(data.tenants.total)} hint={`${data.tenants.newInRange} new in ${days}d`} />
            <Stat label="Active" value={String(data.tenants.active)} />
            {/* Named plainly: this is what the stores sold, not platform revenue. */}
            <Stat
              label={`Gross sales · ${days}d`}
              value={formatMoney(data.grossMerchandiseValue)}
              hint={`${data.orders} orders`}
            />
            <Stat label="Customers" value={String(data.catalogue.customers)} hint={`${data.catalogue.products} products`} />
          </div>

          {data.tenants.suspended > 0 && (
            <Link
              to="/platform/tenants?status=SUSPENDED"
              className="mt-6 inline-block rounded-card border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 hover:bg-amber-100"
            >
              {data.tenants.suspended} store{data.tenants.suspended === 1 ? ' is' : 's are'} suspended
            </Link>
          )}

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section className="rounded-card border border-ink-100 bg-white p-5">
              <h2 className="text-sm font-medium text-ink-950">Busiest stores</h2>
              {data.topTenants.length === 0 ? (
                <p className="mt-3 text-sm text-ink-500">
                  No sales anywhere on the platform in this period.
                </p>
              ) : (
                <ol className="mt-3 space-y-3 text-sm">
                  {data.topTenants.map((t) => (
                    <li key={t.id} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-ink-900">{t.businessName}</span>
                        <span className="font-mono text-xs text-ink-500">{t.slug}</span>
                      </span>
                      <span className="whitespace-nowrap text-right">
                        <span className="block text-ink-950">{formatMoney(t.revenue)}</span>
                        <span className="text-xs text-ink-500">{t.orders} orders</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="rounded-card border border-ink-100 bg-white p-5">
              <h2 className="text-sm font-medium text-ink-950">Stores by state</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Active" value={data.tenants.active} />
                <Row label="Pending" value={data.tenants.pending} />
                <Row label="Suspended" value={data.tenants.suspended} />
                <Row label="Cancelled" value={data.tenants.cancelled} />
              </dl>
              <Link to="/platform/tenants" className="mt-4 inline-block text-sm underline">
                Manage stores
              </Link>
            </section>
          </div>
        </>
      )}
    </Page>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-ink-100 bg-white p-5">
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-2 text-2xl font-medium tracking-tight text-ink-950">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-500">{label}</dt>
      <dd className="tabular-nums text-ink-900">{value}</dd>
    </div>
  );
}
