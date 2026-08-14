import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { platformService, type AuditRow } from '@/services/platform.service';
import { Page } from '@/components/admin/Page';
import { DataTable, type Column } from '@/components/admin/DataTable';

/**
 * The whole-platform trail. Values are already redacted server-side, so nothing
 * shown here needs hiding — but nothing here is editable either: an audit log
 * you can amend is not an audit log.
 */
export default function AuditLog() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['platform-audit', page, action],
    queryFn: () => platformService.audit({ page, limit: 30, action: action || undefined }),
    placeholderData: (previous) => previous,
  });

  const columns: Column<AuditRow>[] = [
    {
      header: 'When',
      cell: (a) => new Date(a.createdAt).toLocaleString(),
      className: 'whitespace-nowrap text-ink-500',
    },
    {
      header: 'Action',
      cell: (a) => <span className="font-mono text-xs text-ink-900">{a.action}</span>,
    },
    {
      header: 'Store',
      cell: (a) =>
        a.tenant ? (
          <span className="text-ink-700">{a.tenant.slug}</span>
        ) : (
          // Platform-level actions (plans, for instance) belong to no tenant.
          <span className="text-xs text-ink-300">platform</span>
        ),
    },
    {
      header: 'By',
      cell: (a) => <span className="text-ink-700">{a.user?.email ?? 'system'}</span>,
    },
    {
      header: 'Details',
      cell: (a) =>
        a.changes ? (
          <button
            onClick={() => setExpanded(expanded === a.id ? null : a.id)}
            className="text-xs underline"
          >
            {expanded === a.id ? 'Hide' : 'Show'}
          </button>
        ) : (
          <span className="text-xs text-ink-300">—</span>
        ),
    },
  ];

  return (
    <Page
      title="Audit log"
      subtitle={query.data?.meta ? `${query.data.meta.total} recorded actions` : 'Who did what'}
    >
      <input
        type="search"
        value={action}
        onChange={(e) => {
          setAction(e.target.value);
          setPage(1);
        }}
        placeholder="Filter by action, e.g. tenant.suspended"
        aria-label="Filter by action"
        className="mb-4 w-full max-w-sm rounded-card border border-ink-100 bg-white px-3 py-2 text-sm"
      />

      <DataTable
        columns={columns}
        rows={query.data?.items}
        meta={query.data?.meta}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        onPage={setPage}
        filtered={Boolean(action)}
        emptyTitle="Nothing recorded yet"
        emptyHint="Suspensions, plan changes and stock adjustments appear here."
        rowKey={(a) => a.id}
      />

      {expanded && (
        <pre className="mt-4 overflow-x-auto rounded-card border border-ink-100 bg-white p-4 text-xs text-ink-700">
          {JSON.stringify(
            query.data?.items.find((a) => a.id === expanded)?.changes,
            null,
            2,
          )}
        </pre>
      )}
    </Page>
  );
}
