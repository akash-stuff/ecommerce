import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/services/api-client';
import { Page } from '@/components/admin/Page';
import { formatMoney } from '@/utils/format';

interface Dashboard {
  revenue: { total: string; previous: string; changePercent: number | null };
  orders: { count: number; previous: number; averageValue: string };
  customers: { total: number; newInRange: number };
  topProducts: { id: string; name: string; sku: string; unitsSold: number; revenue: string }[];
  dailyRevenue: { date: string; revenue: string; orders: number }[];
}

const RANGES = [7, 30, 90];

/**
 * The numbers behind the Overview cards, day by day.
 *
 * Deliberately a table rather than another chart: this page exists for the
 * question "what exactly did we take on the 14th", which a bar chart cannot
 * answer. The Overview covers the at-a-glance view.
 */
export default function Analytics() {
  const [days, setDays] = useState(30);

  const query = useQuery({
    queryKey: ['dashboard', days],
    queryFn: () => unwrap<Dashboard>(apiClient.get('/analytics/dashboard', { params: { days } })),
    placeholderData: (previous) => previous,
  });

  const data = query.data;
  // Newest first: the recent days are the ones anyone actually reads.
  const rows = [...(data?.dailyRevenue ?? [])].reverse();

  return (
    <Page
      title="Analytics"
      subtitle="Day-by-day figures behind your overview"
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
          <p className="text-sm text-ink-700">Analytics couldn't be loaded.</p>
          <button onClick={() => query.refetch()} className="mt-2 text-sm underline">
            Try again
          </button>
        </div>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <section className="overflow-hidden rounded-card border border-ink-100 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Orders</th>
                  <th className="px-4 py-3 font-medium text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((day) => (
                  <tr
                    key={day.date}
                    className={`border-b border-ink-50 last:border-0 ${
                      day.orders === 0 ? 'text-ink-300' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{day.orders || '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {day.orders === 0 ? '—' : formatMoney(day.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-ink-200 text-sm font-medium">
                <tr>
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 tabular-nums">{data.orders.count}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(data.revenue.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>

          <div className="space-y-6">
            <section className="rounded-card border border-ink-100 bg-white p-5">
              <h2 className="text-sm font-medium text-ink-950">Compared with the previous {days} days</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Revenue then" value={formatMoney(data.revenue.previous)} />
                <Row label="Revenue now" value={formatMoney(data.revenue.total)} />
                <Row
                  label="Change"
                  value={
                    data.revenue.changePercent === null
                      ? 'No comparison'
                      : `${data.revenue.changePercent >= 0 ? '+' : ''}${data.revenue.changePercent}%`
                  }
                />
                <Row label="Orders then" value={String(data.orders.previous)} />
                <Row label="Orders now" value={String(data.orders.count)} />
                <Row label="Average order" value={formatMoney(data.orders.averageValue)} />
                <Row label="New customers" value={String(data.customers.newInRange)} />
              </dl>
            </section>

            <section className="rounded-card border border-ink-100 bg-white p-5">
              <h2 className="text-sm font-medium text-ink-950">Best sellers</h2>
              {data.topProducts.length === 0 ? (
                <p className="mt-3 text-sm text-ink-500">Nothing sold in this period.</p>
              ) : (
                <ol className="mt-3 space-y-3 text-sm">
                  {data.topProducts.map((p) => (
                    <li key={p.id} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-ink-900">{p.name}</span>
                        <span className="font-mono text-xs text-ink-500">{p.sku}</span>
                      </span>
                      <span className="whitespace-nowrap text-right">
                        <span className="block text-ink-950">{formatMoney(p.revenue)}</span>
                        <span className="text-xs text-ink-500">{p.unitsSold} sold</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
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
