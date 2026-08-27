import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { apiClient, unwrap } from '@/services/api-client';
import { Page } from '@/components/admin/Page';
import { DataTable, StatusBadge, type Column } from '@/components/admin/DataTable';
import type { PaginationMeta } from '@/types/api';
import { toast, toastFromError } from '@/components/Toasts';

interface ReviewRow {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  isVerifiedPurchase: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  product: { id: string; name: string; sku: string } | null;
  customer: { firstName: string; lastName: string | null; email: string } | null;
}

const FILTERS = ['PENDING', 'APPROVED', 'REJECTED'] as const;

export default function Reviews() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  // Defaults to what needs a decision, rather than to everything.
  const [status, setStatus] = useState<string>('PENDING');

  const query = useQuery({
    queryKey: ['admin-reviews', page, status],
    queryFn: () =>
      apiClient
        .get('/reviews', { params: { page, limit: 20, status: status || undefined } })
        .then((r) => ({
          items: r.data.data as ReviewRow[],
          meta: r.data.meta as PaginationMeta,
        })),
    placeholderData: (previous) => previous,
  });

  const moderate = useMutation({
    // Failures pop in the corner like everything else, so a
    // rejected save cannot be mistaken for a quiet success.
    onError: (e) => toastFromError(e),
    mutationFn: (args: { id: string; status: string }) =>
      unwrap(apiClient.patch(`/reviews/${args.id}`, { status: args.status })),
    onSuccess: () => {
      toast.saved('Review moderated');
      queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const columns: Column<ReviewRow>[] = [
    {
      header: 'Product',
      cell: (r) => (
        <>
          <span className="text-ink-900">{r.product?.name ?? '—'}</span>
          <span className="block font-mono text-xs text-ink-500">{r.product?.sku}</span>
        </>
      ),
    },
    {
      header: 'Rating',
      cell: (r) => (
        <span className="whitespace-nowrap" title={`${r.rating} out of 5`}>
          <span aria-hidden>{'★'.repeat(r.rating)}</span>
          <span className="text-ink-300" aria-hidden>{'★'.repeat(5 - r.rating)}</span>
          <span className="sr-only">{r.rating} out of 5</span>
        </span>
      ),
    },
    {
      header: 'Review',
      cell: (r) => (
        <div className="max-w-sm">
          {r.title && <span className="block text-ink-900">{r.title}</span>}
          <span className="block text-ink-700">{r.comment ?? <em className="text-ink-300">No comment</em>}</span>
        </div>
      ),
    },
    {
      header: 'From',
      cell: (r) => (
        <>
          <span className="text-ink-700">{r.customer?.firstName ?? 'Unknown'}</span>
          {/* Earned by an order, never claimed by the reviewer. */}
          {r.isVerifiedPurchase && (
            <span className="mt-0.5 block text-xs text-green-700">Verified purchase</span>
          )}
        </>
      ),
    },
    { header: 'Status', cell: (r) => <StatusBadge value={r.status} /> },
    {
      header: '',
      cell: (r) => (
        <span className="flex justify-end gap-1">
          {r.status !== 'APPROVED' && (
            <button
              onClick={() => moderate.mutate({ id: r.id, status: 'APPROVED' })}
              disabled={moderate.isPending}
              aria-label="Approve"
              className="rounded p-1.5 text-ink-500 hover:bg-green-50 hover:text-green-700"
            >
              <Check size={16} />
            </button>
          )}
          {r.status !== 'REJECTED' && (
            <button
              onClick={() => moderate.mutate({ id: r.id, status: 'REJECTED' })}
              disabled={moderate.isPending}
              aria-label="Reject"
              className="rounded p-1.5 text-ink-500 hover:bg-red-50 hover:text-red-600"
            >
              <X size={16} />
            </button>
          )}
        </span>
      ),
      className: 'text-right',
    },
  ];

  return (
    <Page
      title="Reviews"
      subtitle="Nothing appears on your storefront until you approve it"
    >
      <div className="mb-4 flex gap-1 rounded-card border border-ink-100 bg-white p-1 w-fit">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => {
              setStatus(f);
              setPage(1);
            }}
            className={`rounded px-3 py-1 text-sm capitalize ${
              status === f ? 'bg-ink-950 text-white' : 'text-ink-700 hover:bg-ink-50'
            }`}
          >
            {f.toLowerCase()}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.items}
        meta={query.data?.meta}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        onPage={setPage}
        emptyTitle={
          status === 'PENDING' ? 'Nothing waiting for you' : `No ${status.toLowerCase()} reviews`
        }
        emptyHint={
          status === 'PENDING' ? 'New reviews land here before customers see them.' : undefined
        }
        rowKey={(r) => r.id}
      />
    </Page>
  );
}
