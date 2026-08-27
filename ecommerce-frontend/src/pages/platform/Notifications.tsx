import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import {
  platformService,
  type PlatformNotification,
} from '@/services/platform.service';
import { EmptyState, Page } from '@/components/admin/Page';
import { DataTable, StatusBadge, type Column } from '@/components/admin/DataTable';

const STATUSES = ['', 'SENT', 'QUEUED', 'FAILED'];

/**
 * Every store's outbound messages, for the platform operator.
 *
 * The tenant admin has its own Notifications screen, and that one is scoped by
 * `requireTenantId()` — a shopkeeper sees their store's mail and nothing else.
 * This is the deliberate counterpart: one place that reads across tenants,
 * behind a `@PlatformOnly` route, with the store named on every row so a list
 * spanning the whole platform can still be read.
 */
export default function PlatformNotifications() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [tenantId, setTenantId] = useState('');

  const query = useQuery({
    queryKey: ['platform-notifications', page, status, search, tenantId],
    queryFn: () =>
      platformService.notifications({
        page,
        limit: 25,
        status: status || undefined,
        search: search || undefined,
        tenantId: tenantId || undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const tenants = useQuery({
    queryKey: ['platform-tenants', 'picker'],
    // 100 is the API's ceiling on a page. A platform with more stores
    // than that needs a searchable picker rather than a longer <select>,
    // so the list says when it is not showing everything.
    queryFn: () => platformService.tenants({ page: 1, limit: 100 }),
    staleTime: 60_000,
  });

  const columns: Column<PlatformNotification>[] = [
    {
      header: 'When',
      cell: (n) => new Date(n.createdAt).toLocaleString(),
      className: 'whitespace-nowrap text-ink-500',
    },
    {
      header: 'Store',
      cell: (n) =>
        n.store ? (
          <Link
            to={`/platform?store=${n.tenantId}`}
            className="text-ink-950 underline decoration-ink-300 underline-offset-2 hover:decoration-ink-950"
          >
            {n.store.businessName}
          </Link>
        ) : (
          // Platform-level notices have no tenant by design.
          <span className="text-xs text-ink-400">Platform</span>
        ),
    },
    { header: 'Event', cell: (n) => <span className="font-mono text-xs">{n.event}</span> },
    {
      header: 'To',
      cell: (n) => <span className="text-ink-700">{n.recipient}</span>,
      className: 'max-w-[16rem] truncate',
    },
    {
      header: 'Status',
      cell: (n) => (
        // The failure reason on hover: it is the whole point of the row when a
        // message did not go, and too long to sit in the column.
        <span title={n.error ?? undefined}>
          <StatusBadge value={n.status} />
        </span>
      ),
    },
  ];

  const filtered = Boolean(status || search || tenantId);

  return (
    <Page
      title="Notifications"
      subtitle={
        query.data?.meta
          ? `${query.data.meta.total} messages across every store`
          : 'Every message the platform has tried to send'
      }
    >
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by recipient"
          aria-label="Search by recipient"
          className="min-w-0 flex-1 rounded-card border border-ink-200 bg-white px-3 py-2 text-sm text-ink-950 transition-colors hover:border-ink-300 focus:border-ink-950 focus:outline-none focus:ring-1 focus:ring-ink-950 sm:max-w-xs"
        />

        <select
          value={tenantId}
          onChange={(e) => {
            setTenantId(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by store"
          className="rounded-card border border-ink-200 bg-white px-3 py-2 text-sm text-ink-950 focus:border-ink-950 focus:outline-none focus:ring-1 focus:ring-ink-950"
        >
          <option value="">Every store</option>
          {(tenants.data?.items ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.businessName}
            </option>
          ))}
        </select>

        <div className="flex gap-1 rounded-card border border-ink-100 bg-white p-1">
          {STATUSES.map((s) => (
            <button
              key={s || 'all'}
              type="button"
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
              aria-pressed={status === s}
              className={`rounded px-3 py-1 text-sm capitalize transition-colors ${
                status === s ? 'bg-ink-950 text-white' : 'text-ink-700 hover:bg-ink-50'
              }`}
            >
              {s ? s.toLowerCase() : 'all'}
            </button>
          ))}
        </div>
      </div>

      {query.data?.items.length === 0 && !filtered ? (
        <EmptyState
          icon={<Mail size={18} />}
          title="Nothing has been sent yet"
          hint="Order confirmations, verification codes and store setup emails appear here as stores start trading."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={query.data?.items}
          meta={query.data?.meta}
          isLoading={query.isLoading}
          isError={query.isError}
          onRetry={() => query.refetch()}
          onPage={setPage}
          filtered={filtered}
          emptyTitle="Nothing has been sent yet"
          rowKey={(n) => n.id}
        />
      )}
    </Page>
  );
}
