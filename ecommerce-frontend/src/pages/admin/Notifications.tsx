import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { apiClient, unwrap } from '@/services/api-client';
import { Page, SecondaryButton } from '@/components/admin/Page';
import { DataTable, StatusBadge, type Column } from '@/components/admin/DataTable';
import type { PaginationMeta } from '@/types/api';
import { toast, toastFromError } from '@/components/Toasts';

interface NotificationRow {
  id: string;
  event: string;
  recipient: string;
  subject: string | null;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  error: string | null;
  sentAt: string | null;
  createdAt: string;
}

export default function Notifications() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const status = useQuery({
    queryKey: ['notification-status'],
    queryFn: () =>
      unwrap<{ emailConfigured: boolean; detail: string }>(
        apiClient.get('/notifications/status'),
      ),
  });

  const log = useQuery({
    queryKey: ['notifications', page],
    queryFn: () =>
      apiClient
        .get('/notifications', { params: { page, limit: 20 } })
        .then((r) => ({
          items: r.data.data as NotificationRow[],
          meta: r.data.meta as PaginationMeta,
        })),
    placeholderData: (previous) => previous,
  });

  const retry = useMutation({
    // Failures pop in the corner like everything else, so a
    // rejected save cannot be mistaken for a quiet success.
    onError: (e) => toastFromError(e),
    mutationFn: () =>
      unwrap<{ attempted: number; sent: number }>(apiClient.post('/notifications/retry', {})),
    onSuccess: () => {
      toast.saved('Retrying delivery');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const columns: Column<NotificationRow>[] = [
    {
      header: 'When',
      cell: (n) => new Date(n.createdAt).toLocaleString(),
      className: 'whitespace-nowrap text-ink-500',
    },
    {
      header: 'Event',
      cell: (n) => <span className="font-mono text-xs text-ink-700">{n.event}</span>,
    },
    { header: 'To', cell: (n) => <span className="text-ink-900">{n.recipient}</span> },
    { header: 'Subject', cell: (n) => <span className="text-ink-700">{n.subject ?? '—'}</span> },
    {
      header: 'Status',
      cell: (n) => (
        <span title={n.error ?? undefined}>
          <StatusBadge value={n.status} />
        </span>
      ),
    },
  ];

  const failed = log.data?.items.filter((n) => n.status !== 'SENT').length ?? 0;

  return (
    <Page
      title="Notifications"
      subtitle="Everything this store has tried to send"
      action={
        failed > 0 ? (
          <SecondaryButton disabled={retry.isPending} onClick={() => retry.mutate()}>
            {retry.isPending ? 'Retrying…' : `Retry ${failed} unsent`}
          </SecondaryButton>
        ) : undefined
      }
    >
      {/* The single most useful fact on this screen: whether mail can leave at
          all. Without it, an empty-looking log is ambiguous. */}
      {status.data && (
        <div
          className={`mb-5 flex items-start gap-3 rounded-card px-4 py-3 text-sm ${
            status.data.emailConfigured
              ? 'bg-green-50 text-green-800'
              : 'bg-amber-50 text-amber-900'
          }`}
        >
          {status.data.emailConfigured ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          )}
          <p>{status.data.detail}</p>
        </div>
      )}

      {retry.data && (
        <p className="mb-4 text-sm text-ink-700">
          Retried {retry.data.attempted}, delivered {retry.data.sent}.
        </p>
      )}

      <DataTable
        columns={columns}
        rows={log.data?.items}
        meta={log.data?.meta}
        isLoading={log.isLoading}
        isError={log.isError}
        onRetry={() => log.refetch()}
        onPage={setPage}
        emptyTitle="Nothing sent yet"
        emptyHint="Order confirmations and status updates will appear here."
        rowKey={(n) => n.id}
      />
    </Page>
  );
}
