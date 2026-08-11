import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { apiClient, unwrap } from '@/services/api-client';
import { Page } from '@/components/admin/Page';
import { formatMoney } from '@/utils/format';

interface Dashboard {
  range: { days: number; from: string; to: string };
  revenue: { total: string; previous: string; changePercent: number | null };
  orders: { count: number; previous: number; averageValue: string };
  customers: { total: number; newInRange: number };
  pending: { orders: number; reviews: number; lowStock: number };
  topProducts: { id: string; name: string; sku: string; unitsSold: number; revenue: string }[];
  dailyRevenue: { date: string; revenue: string; orders: number }[];
}

const RANGES = [7, 30, 90];

export default function Dashboard() {
  const [days, setDays] = useState(30);

  const query = useQuery({
    queryKey: ['dashboard', days],
    queryFn: () => unwrap<Dashboard>(apiClient.get('/analytics/dashboard', { params: { days } })),
    placeholderData: (previous) => previous,
  });

  const data = query.data;

  return (
    <Page
      title="Overview"
      subtitle="Revenue, orders and what needs attention"
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
          <p className="text-sm text-ink-700">The dashboard couldn't be loaded.</p>
          <button onClick={() => query.refetch()} className="mt-2 text-sm underline">
            Try again
          </button>
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label={`Revenue · last ${days} days`}
              value={formatMoney(data.revenue.total)}
              change={data.revenue.changePercent}
            />
            <Stat
              label="Orders"
              value={String(data.orders.count)}
              change={percent(data.orders.previous, data.orders.count)}
            />
            <Stat label="Average order" value={formatMoney(data.orders.averageValue)} />
            <Stat
              label="Customers"
              value={String(data.customers.total)}
              hint={`${data.customers.newInRange} new`}
            />
          </div>

          {/* Things a shopkeeper should act on today, each a link to the work. */}
          {(data.pending.orders > 0 || data.pending.reviews > 0 || data.pending.lowStock > 0) && (
            <div className="mt-6 flex flex-wrap gap-3">
              {data.pending.orders > 0 && (
                <Action to="/admin/orders" label={`${data.pending.orders} order${plural(data.pending.orders)} awaiting confirmation`} />
              )}
              {data.pending.reviews > 0 && (
                <Action to="/admin/reviews" label={`${data.pending.reviews} review${plural(data.pending.reviews)} to moderate`} />
              )}
              {data.pending.lowStock > 0 && (
                <Action to="/admin/products" label={`${data.pending.lowStock} product${plural(data.pending.lowStock)} low on stock`} />
              )}
            </div>
          )}

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
            <RevenueChart series={data.dailyRevenue} />

            <section className="rounded-card border border-ink-100 bg-white p-5">
              <h2 className="text-sm font-medium text-ink-950">Best sellers</h2>
              {data.topProducts.length === 0 ? (
                <p className="mt-3 text-sm text-ink-500">
                  Nothing sold in this period yet.
                </p>
              ) : (
                <ol className="mt-3 space-y-3">
                  {data.topProducts.map((p) => (
                    <li key={p.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate text-ink-900">{p.name}</span>
                        <span className="text-xs text-ink-500">{p.unitsSold} sold</span>
                      </span>
                      <span className="whitespace-nowrap text-ink-950">
                        {formatMoney(p.revenue)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </>
      )}
    </Page>
  );
}

/**
 * Bars drawn with divs rather than a charting library: this is one series of at
 * most 90 points, and the dependency would outweigh what it renders.
 */
function RevenueChart({ series }: { series: Dashboard['dailyRevenue'] }) {
  const peak = Math.max(...series.map((d) => Number(d.revenue)), 1);
  const total = series.reduce((sum, d) => sum + Number(d.revenue), 0);

  return (
    <section className="rounded-card border border-ink-100 bg-white p-5">
      <h2 className="text-sm font-medium text-ink-950">Revenue by day</h2>

      {total === 0 ? (
        <p className="mt-3 text-sm text-ink-500">No revenue in this period.</p>
      ) : (
        <>
          <div className="mt-5 flex h-40 items-end gap-[2px]">
            {series.map((day) => {
              const value = Number(day.revenue);
              return (
                <div
                  key={day.date}
                  title={`${day.date}: ${formatMoney(day.revenue)} · ${day.orders} order${plural(day.orders)}`}
                  className="flex-1 rounded-t bg-ink-950/80 transition-colors hover:bg-ink-950"
                  // Zero days keep a hairline so the axis stays readable.
                  style={{ height: `${Math.max((value / peak) * 100, value > 0 ? 4 : 1)}%` }}
                />
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-xs text-ink-500">
            <span>{series[0]?.date}</span>
            <span>{series[series.length - 1]?.date}</span>
          </div>
        </>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  change,
  hint,
}: {
  label: string;
  value: string;
  change?: number | null;
  hint?: string;
}) {
  return (
    <div className="rounded-card border border-ink-100 bg-white p-5">
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-2 text-2xl font-medium tracking-tight text-ink-950">{value}</p>

      {change !== undefined && change !== null && (
        <p
          className={`mt-1 flex items-center gap-1 text-xs ${
            change >= 0 ? 'text-green-700' : 'text-red-600'
          }`}
        >
          {change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {Math.abs(change)}% vs previous period
        </p>
      )}

      {/* Null means there was nothing to compare against, which is not 0%. */}
      {change === null && (
        <p className="mt-1 text-xs text-ink-500">No previous period to compare</p>
      )}

      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

function Action({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-card border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 hover:bg-amber-100"
    >
      {label}
    </Link>
  );
}

const plural = (n: number) => (n === 1 ? '' : 's');

function percent(before: number, after: number): number | null {
  if (before === 0) return null;
  return Number((((after - before) / before) * 100).toFixed(1));
}
