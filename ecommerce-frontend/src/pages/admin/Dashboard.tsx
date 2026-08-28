import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Download } from 'lucide-react';
import { apiClient, unwrap } from '@/services/api-client';
import { Page, SecondaryButton } from '@/components/admin/Page';
import { formatMoney } from '@/utils/format';
import { csvRow, datedFilename, downloadCsv } from '@/utils/csv';
import { toast } from '@/components/Toasts';

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

/**
 * The Overview as a spreadsheet.
 *
 * Three sections in one file rather than three files: the headline figures, the
 * day-by-day series behind the chart, and the top products table. A blank line
 * separates them, which is what spreadsheet software treats as a new block —
 * and what someone pasting this into a report expects.
 *
 * Raw numbers, not formatted ones: `1234.50` sums in a spreadsheet, `₹1,234.50`
 * does not.
 */
function overviewCsv(data: Dashboard): string[] {
  const lines: string[] = [];

  lines.push(csvRow(['Overview']));
  lines.push(csvRow(['Range (days)', data.range.days]));
  lines.push(csvRow(['From', data.range.from]));
  lines.push(csvRow(['To', data.range.to]));
  lines.push('');

  lines.push(csvRow(['Metric', 'Value', 'Previous period']));
  lines.push(csvRow(['Revenue', data.revenue.total, data.revenue.previous]));
  lines.push(csvRow(['Orders', data.orders.count, data.orders.previous]));
  lines.push(csvRow(['Average order value', data.orders.averageValue, '']));
  lines.push(csvRow(['Customers (total)', data.customers.total, '']));
  lines.push(csvRow(['Customers (new in range)', data.customers.newInRange, '']));
  lines.push(csvRow(['Orders awaiting action', data.pending.orders, '']));
  lines.push(csvRow(['Reviews awaiting moderation', data.pending.reviews, '']));
  lines.push(csvRow(['Products low on stock', data.pending.lowStock, '']));
  lines.push('');

  lines.push(csvRow(['Date', 'Revenue', 'Orders']));
  for (const day of data.dailyRevenue) {
    lines.push(csvRow([day.date, day.revenue, day.orders]));
  }
  lines.push('');

  lines.push(csvRow(['Top product', 'SKU', 'Units sold', 'Revenue']));
  for (const product of data.topProducts) {
    lines.push(csvRow([product.name, product.sku, product.unitsSold, product.revenue]));
  }

  return lines;
}

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
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-card border border-ink-100 bg-white p-1 shadow-card">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDays(r)}
                aria-pressed={days === r}
                className={`numeric rounded px-3 py-1 text-sm transition-colors ${
                  days === r ? 'bg-ink-950 text-white' : 'text-ink-700 hover:bg-ink-50'
                }`}
              >
                {r}d
              </button>
            ))}
          </div>

          {/* Disabled until there are figures to export, rather than handing
              over a file with nothing but headers in it. */}
          <SecondaryButton
            disabled={!data}
            onClick={() => {
              if (!data) return;
              downloadCsv(datedFilename(`overview-${data.range.days}d`), overviewCsv(data));
              toast.saved('Overview exported', `${data.range.days} days of figures`);
            }}
          >
            <Download size={13} />
            Export CSV
          </SecondaryButton>
        </div>
      }
    >
      {/* Skeletons only on the first load. Switching range keeps the previous
          numbers on screen via `placeholderData`, so replacing them with grey
          bars would be a step backwards. */}
      {query.isLoading && !data && (
        <div aria-busy="true">
          <span className="sr-only">Loading…</span>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-card border border-ink-100 bg-white p-5">
                <div className="skeleton h-2.5 w-2/3" />
                <div className="skeleton mt-4 h-7 w-1/2" />
                <div className="skeleton mt-3 h-2.5 w-3/4" />
              </div>
            ))}
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
            <div className="skeleton h-64" />
            <div className="skeleton h-64" />
          </div>
        </div>
      )}

      {query.isError && (
        <div className="rounded-card border border-ink-100 bg-white p-10 text-center shadow-card">
          <p className="text-sm text-ink-700">The dashboard couldn&apos;t be loaded.</p>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="mt-2 text-sm font-medium text-ink-950 underline decoration-ink-300 underline-offset-2 hover:decoration-ink-950"
          >
            Try again
          </button>
        </div>
      )}

      {data && (
        <div className={query.isFetching ? 'transition-opacity duration-150 opacity-60' : ''}>
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
              hint={`${data.customers.newInRange} new in this period`}
            />
          </div>

          {/* Things a shopkeeper should act on today, each a link to the work. */}
          {(data.pending.orders > 0 || data.pending.reviews > 0 || data.pending.lowStock > 0) && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.pending.orders > 0 && (
                <Action
                  to="/admin/orders"
                  label={`${data.pending.orders} order${plural(data.pending.orders)} awaiting confirmation`}
                />
              )}
              {data.pending.reviews > 0 && (
                <Action
                  to="/admin/reviews"
                  label={`${data.pending.reviews} review${plural(data.pending.reviews)} to moderate`}
                />
              )}
              {data.pending.lowStock > 0 && (
                <Action
                  to="/admin/products"
                  label={`${data.pending.lowStock} product${plural(data.pending.lowStock)} low on stock`}
                />
              )}
            </div>
          )}

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
            <RevenueChart series={data.dailyRevenue} />

            <section className="rounded-card border border-ink-100 bg-white shadow-card">
              <header className="border-b border-ink-100 px-5 py-4">
                <h2 className="text-sm font-medium text-ink-950">Best sellers</h2>
              </header>
              <div className="p-5">
                {data.topProducts.length === 0 ? (
                  <p className="text-sm text-ink-500">Nothing sold in this period yet.</p>
                ) : (
                  <ol className="space-y-3">
                    {data.topProducts.map((p, i) => (
                      <li key={p.id} className="flex items-baseline gap-3 text-sm">
                        <span className="numeric w-3 shrink-0 text-right text-xs text-ink-400">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-ink-900">{p.name}</span>
                          <span className="numeric text-xs text-ink-500">{p.unitsSold} sold</span>
                        </span>
                        <span className="numeric whitespace-nowrap text-ink-950">
                          {formatMoney(p.revenue)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          </div>
        </div>
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
  const best = series.reduce(
    (top, d) => (Number(d.revenue) > Number(top.revenue) ? d : top),
    series[0] ?? { date: '', revenue: '0', orders: 0 },
  );

  return (
    <section className="rounded-card border border-ink-100 bg-white shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-100 px-5 py-4">
        <h2 className="text-sm font-medium text-ink-950">Revenue by day</h2>
        {total > 0 && (
          <p className="numeric text-xs text-ink-500">
            Best day {best.date} · {formatMoney(best.revenue)}
          </p>
        )}
      </header>

      <div className="p-5">
        {total === 0 ? (
          <p className="text-sm text-ink-500">No revenue in this period.</p>
        ) : (
          <>
            <div className="relative h-44">
              {/* Gridlines at the quarter marks, behind the bars. Without them a
                  bar's height is only comparable to its neighbours, not to a
                  number. */}
              <div className="absolute inset-0 flex flex-col justify-between">
                {[1, 0.75, 0.5, 0.25, 0].map((fraction) => (
                  <div key={fraction} className="flex items-center gap-2">
                    <span className="numeric w-12 shrink-0 text-right text-[10px] text-ink-400">
                      {fraction === 0 ? '0' : compact(peak * fraction)}
                    </span>
                    <span className="h-px flex-1 bg-ink-100" />
                  </div>
                ))}
              </div>

              <div className="absolute inset-y-0 left-14 right-0 flex items-end gap-px">
                {series.map((day) => {
                  const value = Number(day.revenue);
                  return (
                    <div
                      key={day.date}
                      title={`${day.date}: ${formatMoney(day.revenue)} · ${day.orders} order${plural(day.orders)}`}
                      className="group relative flex-1 rounded-t bg-ink-900/75 transition-colors hover:bg-ink-950"
                      // Zero days keep a hairline so the axis stays readable.
                      style={{ height: `${Math.max((value / peak) * 100, value > 0 ? 4 : 1)}%` }}
                    />
                  );
                })}
              </div>
            </div>

            <div className="numeric mt-2 flex justify-between pl-14 text-xs text-ink-500">
              <span>{series[0]?.date}</span>
              <span>{series[series.length - 1]?.date}</span>
            </div>
          </>
        )}
      </div>
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
    <div className="rounded-card border border-ink-100 bg-white p-5 shadow-card">
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className="numeric mt-2 text-2xl font-medium tracking-tight text-ink-950">{value}</p>

      {change !== undefined && change !== null && (
        <p
          className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs ${
            change >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
          }`}
        >
          {change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          <span className="numeric">{Math.abs(change)}%</span>
          <span className="text-ink-500">vs previous</span>
        </p>
      )}

      {/* Null means there was nothing to compare against, which is not 0%. */}
      {change === null && (
        <p className="mt-1.5 text-xs text-ink-500">No previous period to compare</p>
      )}

      {hint && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

function Action({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between gap-3 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition-colors hover:border-amber-300 hover:bg-amber-100"
    >
      <span>{label}</span>
      <ArrowRight
        size={14}
        className="shrink-0 text-amber-700 transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

const plural = (n: number) => (n === 1 ? '' : 's');

/** Axis labels only, so precision matters less than staying inside 12ch. */
function compact(value: number): string {
  if (value >= 10_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (value >= 100_000) return `${Math.round(value / 1_000)}k`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

function percent(before: number, after: number): number | null {
  if (before === 0) return null;
  return Number((((after - before) / before) * 100).toFixed(1));
}
