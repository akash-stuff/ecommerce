import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { orderService } from '@/services/admin.service';
import { Page } from '@/components/admin/Page';
import { DataTable, StatusBadge, type Column } from '@/components/admin/DataTable';
import { formatMoney } from '@/utils/format';
import type { AdminOrderRow } from '@/types/api';

const STATUSES = [
  'PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED',
  'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED',
];

export default function Orders() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['admin-orders', page, status, search],
    queryFn: () =>
      orderService.list({
        page,
        limit: 20,
        status: status || undefined,
        search: search || undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const columns: Column<AdminOrderRow>[] = [
    {
      header: 'Order',
      cell: (o) => <span className="font-mono text-xs text-ink-900">{o.orderNumber}</span>,
    },
    { header: 'Customer', cell: (o) => <span className="text-ink-700">{o.customerEmail}</span> },
    {
      header: 'Placed',
      cell: (o) =>
        new Date(o.placedAt).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
      className: 'whitespace-nowrap text-ink-500',
    },
    { header: 'Items', cell: (o) => o._count.items, className: 'text-ink-700' },
    {
      header: 'Total',
      cell: (o) => formatMoney(o.grandTotal, o.currency),
      className: 'font-medium text-ink-950',
    },
    { header: 'Status', cell: (o) => <StatusBadge value={o.status} /> },
    { header: 'Payment', cell: (o) => <StatusBadge value={o.paymentStatus} /> },
  ];

  return (
    <Page
      title="Orders"
      subtitle={query.data?.meta ? `${query.data.meta.total} placed` : 'Everything customers have bought'}
    >
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search order number or email"
          aria-label="Search orders"
          className="w-full max-w-xs rounded-card border border-ink-100 bg-white px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
          className="rounded-card border border-ink-100 bg-white px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.items}
        meta={query.data?.meta}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        onPage={setPage}
        filtered={Boolean(search || status)}
        emptyTitle="No orders yet"
        emptyHint="Orders placed in your storefront will appear here."
        rowKey={(o) => o.id}
        onRowClick={(o) => navigate(`/admin/orders/${o.id}`)}
      />
    </Page>
  );
}
