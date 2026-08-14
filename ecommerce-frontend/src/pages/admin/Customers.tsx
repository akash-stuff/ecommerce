import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/api-client';
import { Page } from '@/components/admin/Page';
import { DataTable, StatusBadge, type Column } from '@/components/admin/DataTable';
import { formatMoney } from '@/utils/format';
import type { PaginationMeta } from '@/types/api';

interface CustomerRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  lastOrderAt: string | null;
  orderCount: number;
  totalSpent: string;
}

export default function Customers() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [ordersOnly, setOrdersOnly] = useState(false);

  const query = useQuery({
    queryKey: ['admin-customers', page, search, ordersOnly],
    queryFn: () =>
      apiClient
        .get('/customers', {
          params: {
            page,
            limit: 20,
            search: search || undefined,
            hasOrdered: ordersOnly || undefined,
          },
        })
        .then((r) => ({
          items: r.data.data as CustomerRow[],
          meta: r.data.meta as PaginationMeta,
        })),
    placeholderData: (previous) => previous,
  });

  const columns: Column<CustomerRow>[] = [
    {
      header: 'Customer',
      cell: (c) => (
        <>
          <span className="text-ink-900">
            {c.firstName} {c.lastName ?? ''}
          </span>
          <span className="block text-xs text-ink-500">{c.email}</span>
        </>
      ),
    },
    { header: 'Phone', cell: (c) => c.phone ?? '—', className: 'text-ink-700' },
    { header: 'Orders', cell: (c) => c.orderCount, className: 'tabular-nums text-ink-700' },
    {
      header: 'Spent',
      cell: (c) => formatMoney(c.totalSpent),
      className: 'font-medium tabular-nums text-ink-950',
    },
    {
      header: 'Last order',
      cell: (c) =>
        c.lastOrderAt
          ? new Date(c.lastOrderAt).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          : 'Never',
      className: 'whitespace-nowrap text-ink-500',
    },
    {
      header: 'Joined',
      cell: (c) => new Date(c.createdAt).toLocaleDateString(),
      className: 'whitespace-nowrap text-ink-500',
    },
    {
      header: 'Status',
      cell: (c) => <StatusBadge value={c.isActive ? 'active' : 'archived'} />,
    },
  ];

  return (
    <Page
      title="Customers"
      subtitle={
        query.data?.meta ? `${query.data.meta.total} registered` : 'People who shop with you'
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search name, email or phone"
          aria-label="Search customers"
          className="w-full max-w-xs rounded-card border border-ink-100 bg-white px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={ordersOnly}
            onChange={(e) => {
              setOrdersOnly(e.target.checked);
              setPage(1);
            }}
            className="h-4 w-4 rounded border-ink-300"
          />
          Only those who have ordered
        </label>
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.items}
        meta={query.data?.meta}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        onPage={setPage}
        filtered={Boolean(search || ordersOnly)}
        emptyTitle="No customers yet"
        emptyHint="Anyone who creates an account in your storefront appears here."
        rowKey={(c) => c.id}
        onRowClick={(c) => navigate(`/admin/customers/${c.id}`)}
      />
    </Page>
  );
}
