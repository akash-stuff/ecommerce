import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  IndianRupee,
  LayoutTemplate,
  Package,
  Plus,
  ShoppingCart,
  Users,
  Download,
} from 'lucide-react';
import {
  platformService,
  type PlatformOverview as PlatformOverviewData,
  type StoreBreakdown,
} from '@/services/platform.service';
import { Card, EmptyState, Page, PrimaryButton, SecondaryButton } from '@/components/admin/Page';
import { StatusBadge } from '@/components/admin/DataTable';
import { formatMoney } from '@/utils/format';
import { csvRow, datedFilename, downloadCsv } from '@/utils/csv';
import { toast } from '@/components/Toasts';

const RANGES = [7, 30, 90];

/**
 * The platform-wide view as a spreadsheet: the estate, then the leaderboard.
 *
 * Raw numbers rather than formatted money, so the columns still add up when
 * someone drops them into a report.
 */
function platformCsv(data: PlatformOverviewData): string[] {
  const lines: string[] = [];
  lines.push(csvRow(['Platform overview']));
  lines.push(csvRow(['Range (days)', data.range.days]));
  lines.push('');

  lines.push(csvRow(['Metric', 'Value']));
  lines.push(csvRow(['Stores (total)', data.tenants.total]));
  lines.push(csvRow(['Stores active', data.tenants.active]));
  lines.push(csvRow(['Stores pending', data.tenants.pending]));
  lines.push(csvRow(['Stores suspended', data.tenants.suspended]));
  lines.push(csvRow(['Stores cancelled', data.tenants.cancelled]));
  lines.push(csvRow(['Stores new in range', data.tenants.newInRange]));
  lines.push(csvRow(['Products', data.catalogue.products]));
  lines.push(csvRow(['Customers', data.catalogue.customers]));
  lines.push(csvRow(['Gross merchandise value', data.grossMerchandiseValue]));
  lines.push(csvRow(['Orders', data.orders]));
  lines.push('');

  lines.push(csvRow(['Store', 'Slug', 'Orders', 'Revenue']));
  for (const t of data.topTenants) {
    lines.push(csvRow([t.businessName, t.slug, t.orders, t.revenue]));
  }
  return lines;
}

/** One store's breakdown, when the picker has narrowed the page to it. */
function storeCsv(data: StoreBreakdown): string[] {
  const lines: string[] = [];
  lines.push(csvRow([data.tenant.businessName]));
  lines.push(csvRow(['Slug', data.tenant.slug]));
  lines.push(csvRow(['Status', data.tenant.status]));
  lines.push(csvRow(['Plan', data.tenant.plan ?? '']));
  lines.push(csvRow(['Contact', data.tenant.contactEmail]));
  lines.push(csvRow(['Currency', data.tenant.currency]));
  lines.push(csvRow(['Created', data.tenant.createdAt]));
  lines.push(csvRow(['Range (days)', data.range.days]));
  lines.push(csvRow(['From', data.range.from]));
  lines.push(csvRow(['To', data.range.to]));
  lines.push('');

  lines.push(csvRow(['Metric', 'Value', 'Previous period']));
  lines.push(csvRow(['Revenue', data.revenue.total, data.revenue.previous]));
  lines.push(csvRow(['Orders', data.orders.count, data.orders.previous]));
  lines.push(csvRow(['Average order value', data.orders.averageValue, '']));
  lines.push(csvRow(['Products', data.catalogue.products, '']));
  lines.push(csvRow(['Products live', data.catalogue.live, '']));
  lines.push(csvRow(['Customers', data.catalogue.customers, '']));
  lines.push('');

  lines.push(csvRow(['Order status', 'Count']));
  for (const [status, count] of Object.entries(data.orders.byStatus)) {
    lines.push(csvRow([status, count]));
  }
  lines.push('');

  lines.push(csvRow(['Top product', 'SKU', 'Units sold', 'Revenue']));
  for (const p of data.topProducts) {
    lines.push(csvRow([p.name, p.sku, p.unitsSold, p.revenue]));
  }
  return lines;
}

export default function PlatformOverview() {
  const [days, setDays] = useState(30);
  /**
   * Which store is being examined, in the URL rather than in state.
   *
   * An operator comparing stores wants to send someone "look at this one", and
   * the browser's back button should step back through what they looked at.
   * Empty means the whole platform.
   */
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('store') ?? '';

  const selectStore = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('store', id);
    else next.delete('store');
    setParams(next, { replace: true });
  };

  // Only fetched once a store is chosen — most visits are the platform view.
  const store = useQuery({
    queryKey: ['platform-store-breakdown', selectedId, days],
    queryFn: () => platformService.storeBreakdown(selectedId, days),
    enabled: Boolean(selectedId),
    placeholderData: (previous) => previous,
  });

  // The picker lists every store, not just the busiest five the overview shows.
  const tenants = useQuery({
    queryKey: ['platform-tenants', 'picker'],
    // 100 is the API's ceiling on a page. A platform with more stores
    // than that needs a searchable picker rather than a longer <select>,
    // so the list says when it is not showing everything.
    queryFn: () => platformService.tenants({ page: 1, limit: 100 }),
    staleTime: 60_000,
  });

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
        <>
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
          {/* Exports whichever view is on screen: the whole estate, or the one
              store the picker has narrowed to. */}
          <SecondaryButton
            disabled={selectedId ? !store.data : !data}
            onClick={() => {
              if (selectedId && store.data) {
                downloadCsv(
                  datedFilename(`store-${store.data.tenant.slug}-${days}d`),
                  storeCsv(store.data),
                );
                toast.saved('Store exported', store.data.tenant.businessName);
                return;
              }
              if (!data) return;
              downloadCsv(datedFilename(`platform-${days}d`), platformCsv(data));
              toast.saved('Platform exported', `${days} days of figures`);
            }}
          >
            <Download size={13} />
            Export CSV
          </SecondaryButton>

          <Link to="/platform/tenants?new=1">
            <PrimaryButton>
              <Plus size={15} />
              Add store
            </PrimaryButton>
          </Link>
        </>
      }
    >
      {/* The scope selector, above everything it changes. */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-card border border-ink-100 bg-white p-3 shadow-card">
        <label htmlFor="store-picker" className="text-sm text-ink-700">
          Analysing
        </label>
        <select
          id="store-picker"
          value={selectedId}
          onChange={(e) => selectStore(e.target.value)}
          className="min-w-0 flex-1 rounded-card border border-ink-200 bg-white px-3 py-2 text-sm text-ink-950 transition-colors hover:border-ink-300 focus:border-ink-950 focus:outline-none focus:ring-1 focus:ring-ink-950 sm:max-w-xs sm:flex-none"
        >
          <option value="">Every store on the platform</option>
          {(tenants.data?.items ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.businessName} · {t.slug}
            </option>
          ))}
        </select>

        {selectedId && (
          <button
            type="button"
            onClick={() => selectStore('')}
            className="text-sm text-ink-500 underline transition-colors hover:text-ink-950"
          >
            Back to the whole platform
          </button>
        )}

        {/* Silently listing the first hundred of two hundred stores would be a
            picker that quietly cannot reach half the platform. */}
        {(tenants.data?.meta?.total ?? 0) > (tenants.data?.items.length ?? 0) && (
          <span className="text-xs text-ink-500">
            Showing the first {tenants.data?.items.length} of {tenants.data?.meta.total} stores —
            find the rest from{' '}
            <Link to="/platform/tenants" className="underline">
              Stores
            </Link>
            .
          </span>
        )}
      </div>

      {/* A store is selected, so the platform-wide figures below are not what
          the operator asked for and are replaced rather than added to. */}
      {selectedId && (
        <StorePanel
          query={store}
          days={days}
          onClear={() => selectStore('')}
        />
      )}

      {/* Skeletons only on a cold load. Switching range keeps the previous
          numbers via placeholderData, so replacing them with grey bars would be
          a step backwards. */}
      {!selectedId && query.isLoading && !data && (
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
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="skeleton h-64" />
            <div className="skeleton h-64" />
          </div>
        </div>
      )}

      {!selectedId && query.isError && (
        <div className="rounded-card border border-ink-100 bg-white p-10 text-center shadow-card">
          <p className="text-sm text-ink-700">The overview couldn&apos;t be loaded.</p>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="mt-2 text-sm font-medium text-ink-950 underline decoration-ink-300 underline-offset-2 hover:decoration-ink-950"
          >
            Try again
          </button>
        </div>
      )}

      {!selectedId && data && (
        <div className={query.isFetching ? 'opacity-60 transition-opacity duration-150' : ''}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              icon={Building2}
              label="Stores"
              value={String(data.tenants.total)}
              hint={`${data.tenants.newInRange} new in ${days}d`}
            />
            <Stat
              icon={Users}
              label="Customers"
              value={String(data.catalogue.customers)}
              hint="across every store"
            />
            {/* Named plainly: this is what the stores sold, not platform revenue. */}
            <Stat
              icon={IndianRupee}
              label={`Gross sales · ${days}d`}
              value={formatMoney(data.grossMerchandiseValue)}
              hint={`${data.orders} order${data.orders === 1 ? '' : 's'}`}
            />
            <Stat
              icon={Package}
              label="Products"
              value={String(data.catalogue.products)}
              hint="published and draft"
            />
          </div>

          {data.tenants.suspended > 0 && (
            <Link
              to="/platform/tenants?status=SUSPENDED"
              className="group mt-6 flex items-center justify-between gap-3 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition-colors hover:border-amber-300 hover:bg-amber-100"
            >
              <span className="flex items-center gap-2.5">
                <AlertTriangle size={16} className="shrink-0 text-amber-700" />
                {data.tenants.suspended} store
                {data.tenants.suspended === 1 ? ' is' : 's are'} suspended
              </span>
              <ArrowRight
                size={14}
                className="shrink-0 text-amber-700 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          )}

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card
              title="Busiest stores"
              description={`By sales in the last ${days} days`}
              action={
                <Link to="/platform/tenants">
                  <SecondaryButton size="sm">All stores</SecondaryButton>
                </Link>
              }
            >
              {data.topTenants.length === 0 ? (
                <p className="py-4 text-sm text-ink-500">
                  No sales anywhere on the platform in this period.
                </p>
              ) : (
                <ol className="space-y-1">
                  {data.topTenants.map((t, i) => (
                    <li key={t.id}>
                      <Link
                        to={`/platform/tenants?q=${encodeURIComponent(t.slug)}`}
                        className="group flex items-center gap-3 rounded-card px-2 py-2.5 transition-colors hover:bg-ink-50"
                      >
                        {/* Rank, not a bullet: the list is ordered and the
                            position is the information. */}
                        <span className="numeric w-4 shrink-0 text-right text-xs text-ink-400">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink-950 group-hover:text-ink-950">
                            {t.businessName}
                          </span>
                          <span className="font-mono text-xs text-ink-500">{t.slug}</span>
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-right">
                          <span className="numeric block text-sm font-medium text-ink-950">
                            {formatMoney(t.revenue)}
                          </span>
                          <span className="numeric text-xs text-ink-500">
                            {t.orders} order{t.orders === 1 ? '' : 's'}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card title="Stores by state">
              {/* A bar apiece rather than a table of four numbers: the shape of
                  the platform — mostly active, a few pending — is the thing
                  worth seeing at a glance. */}
              <div className="space-y-3.5">
                <StateBar
                  label="Active"
                  value={data.tenants.active}
                  total={data.tenants.total}
                  tone="bg-brand"
                />
                <StateBar
                  label="Pending"
                  value={data.tenants.pending}
                  total={data.tenants.total}
                  tone="bg-brand-secondary"
                />
                <StateBar
                  label="Suspended"
                  value={data.tenants.suspended}
                  total={data.tenants.total}
                  tone="bg-red-500"
                />
                <StateBar
                  label="Cancelled"
                  value={data.tenants.cancelled}
                  total={data.tenants.total}
                  tone="bg-ink-300"
                />
              </div>

              <div className="mt-6 flex flex-wrap gap-2 border-t border-ink-100 pt-5">
                <Link to="/platform/tenants">
                  <SecondaryButton size="sm">Manage stores</SecondaryButton>
                </Link>
                <Link to="/platform/templates">
                  <SecondaryButton size="sm">
                    <LayoutTemplate size={13} />
                    Templates
                  </SecondaryButton>
                </Link>
              </div>
            </Card>
          </div>

          {data.tenants.total === 0 && (
            <div className="mt-8">
              <EmptyState
                icon={<Building2 size={18} />}
                title="No stores yet"
                hint="Create the first one and its owner gets a setup email with their admin address."
                action={
                  <Link to="/platform/tenants?new=1">
                    <PrimaryButton>Add the first store</PrimaryButton>
                  </Link>
                }
              />
            </div>
          )}
        </div>
      )}
    </Page>
  );
}

/**
 * One store's numbers.
 *
 * Replaces the platform figures rather than sitting alongside them: an operator
 * who picked a store is asking about that store, and leaving the platform
 * totals on screen invites reading one set of numbers as the other.
 */
function StorePanel({
  query,
  days,
  onClear,
}: {
  query: {
    data?: StoreBreakdown;
    isLoading: boolean;
    isError: boolean;
    isFetching: boolean;
    refetch: () => void;
  };
  days: number;
  onClear: () => void;
}) {
  if (query.isLoading && !query.data) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Loading store</span>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-card border border-ink-100 bg-white p-5">
              <div className="skeleton h-2.5 w-2/3" />
              <div className="skeleton mt-4 h-7 w-1/2" />
            </div>
          ))}
        </div>
        <div className="skeleton mt-6 h-64" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-card border border-ink-100 bg-white p-10 text-center shadow-card">
        <p className="text-sm text-ink-700">That store&apos;s numbers could not be loaded.</p>
        <div className="mt-3 flex justify-center gap-3">
          <SecondaryButton size="sm" onClick={() => query.refetch()}>
            Try again
          </SecondaryButton>
          <SecondaryButton size="sm" onClick={onClear}>
            Back to the platform
          </SecondaryButton>
        </div>
      </div>
    );
  }

  const { tenant, revenue, orders, catalogue, topProducts } = query.data;
  const money = (v: string) => formatMoney(v, tenant.currency);
  const statuses = Object.entries(orders.byStatus).sort((a, b) => b[1] - a[1]);

  return (
    <div className={query.isFetching ? 'opacity-60 transition-opacity duration-150' : ''}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-card border border-ink-100 bg-white p-5 shadow-card">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg tracking-tight text-ink-950">
              {tenant.businessName}
            </h2>
            <StatusBadge value={tenant.status} />
            {!tenant.isPublished && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-600/15">
                Not published
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-xs text-ink-500">{tenant.slug}</p>
          <p className="mt-2 text-sm text-ink-500">
            {tenant.contactEmail}
            {tenant.plan && <span className="ml-2 text-ink-400">- {tenant.plan}</span>}
            <span className="ml-2 text-ink-400">
              since {new Date(tenant.createdAt).toLocaleDateString()}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Link to={`/platform/tenants?q=${encodeURIComponent(tenant.slug)}`}>
            <SecondaryButton size="sm">Manage</SecondaryButton>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={IndianRupee}
          label={`Revenue - ${days}d`}
          value={money(revenue.total)}
          change={revenue.changePercent}
        />
        <Stat
          icon={ShoppingCart}
          label="Orders"
          value={String(orders.count)}
          change={percentChange(orders.previous, orders.count)}
        />
        <Stat icon={IndianRupee} label="Average order" value={money(orders.averageValue)} />
        <Stat
          icon={Users}
          label="Customers"
          value={String(catalogue.customers)}
          hint={`${catalogue.live} of ${catalogue.products} products live`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Best sellers" description={`In the last ${days} days`}>
          {topProducts.length === 0 ? (
            <p className="py-4 text-sm text-ink-500">Nothing sold in this period.</p>
          ) : (
            <ol className="space-y-3">
              {topProducts.map((p, i) => (
                <li key={p.id} className="flex items-baseline gap-3 text-sm">
                  <span className="numeric w-3 shrink-0 text-right text-xs text-ink-400">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink-950">{p.name}</span>
                    <span className="numeric font-mono text-xs text-ink-500">
                      {p.sku} - {p.unitsSold} sold
                    </span>
                  </span>
                  <span className="numeric shrink-0 whitespace-nowrap font-medium text-ink-950">
                    {money(p.revenue)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="Orders by state">
          {statuses.length === 0 ? (
            <p className="py-4 text-sm text-ink-500">No orders in this period.</p>
          ) : (
            <div className="space-y-2.5">
              {statuses.map(([status, count]) => (
                <div key={status} className="flex items-center justify-between gap-3">
                  <StatusBadge value={status} />
                  <span className="numeric text-sm text-ink-950">{count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Null when there is nothing to compare against, which is not zero change. */
function percentChange(before: number, after: number): number | null {
  if (before === 0) return null;
  return Number((((after - before) / before) * 100).toFixed(1));
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  change,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  hint?: string;
  /** Undefined omits it; null means there was no previous period to compare. */
  change?: number | null;
}) {
  return (
    /**
     * The hairline at the top is the brand pair, revealed on hover.
     *
     * `overflow-hidden` so it follows the corner radius, and it is an absolutely
     * positioned element rather than a border, because a border that appears on
     * hover shifts every other card in the row by a pixel.
     */
    <div className="group relative overflow-hidden rounded-card border border-ink-100 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/20 hover:shadow-lifted">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r from-brand to-brand-secondary transition-transform duration-300 group-hover:scale-x-100"
      />
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-brand/15 bg-brand/[0.06] text-brand transition-colors group-hover:border-brand/30">
          <Icon size={14} strokeWidth={1.75} />
        </span>
      </div>
      <p className="numeric mt-3 text-2xl font-semibold tracking-tight text-ink-950">{value}</p>

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

      {change === null && (
        <p className="mt-1.5 text-xs text-ink-500">No previous period to compare</p>
      )}

      {hint && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

/**
 * One state as a proportion of the platform.
 *
 * The bar is drawn even at zero — a 0% "Suspended" row is information, and
 * hiding it would make the list change length as the platform changes shape.
 */
function StateBar({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: string;
}) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-ink-700">{label}</span>
        <span className="numeric text-ink-950">
          {value}
          <span className="ml-1.5 text-xs text-ink-400">{percent}%</span>
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100/80">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${tone}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
