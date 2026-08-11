import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { productService } from '@/services/store.service';
import { formatMoney } from '@/utils/format';

export default function Products() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-products', page, search],
    queryFn: () => productService.list({ page, limit: 20, search: search || undefined }),
    placeholderData: (previous) => previous,
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-ink-950">Products</h1>
          <p className="mt-1 text-sm text-ink-500">
            {data?.meta ? `${data.meta.total} in your catalogue` : 'Your catalogue'}
          </p>
        </div>
        <button
          onClick={() => navigate('/admin/products/new')}
          className="rounded-card bg-ink-950 px-4 py-2 text-sm font-medium text-white"
        >
          Add product
        </button>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        placeholder="Search by name or SKU"
        aria-label="Search products"
        className="mt-6 w-full max-w-xs rounded-card border border-ink-100 bg-white px-3 py-2 text-sm"
      />

      <div className="mt-4 overflow-hidden rounded-card border border-ink-100 bg-white">
        {isLoading && <div className="p-8 text-sm text-ink-500">Loading products…</div>}

        {isError && (
          <div className="p-8 text-center">
            <p className="text-sm text-ink-700">Products couldn't be loaded.</p>
            <button onClick={() => refetch()} className="mt-2 text-sm font-medium text-ink-950 underline">
              Try again
            </button>
          </div>
        )}

        {data && data.items.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-sm text-ink-700">
              {search ? 'No products match that search' : 'No products yet'}
            </p>
            <p className="mt-1 text-sm text-ink-500">
              {search ? 'Try a different name or SKU.' : 'Add your first product to open your store.'}
            </p>
          </div>
        )}

        {data && data.items.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/admin/products/${p.id}/edit`)}
                  className="cursor-pointer border-b border-ink-50 last:border-0 hover:bg-ink-50"
                >
                  <td className="px-4 py-3 text-ink-900">{p.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-500">{p.sku}</td>
                  <td className="px-4 py-3 text-ink-900">{formatMoney(p.price)}</td>
                  <td className={`px-4 py-3 ${p.stock === 0 ? 'text-red-600' : 'text-ink-700'}`}>
                    {p.stock === 0 ? 'Out of stock' : p.stock}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-ink-50 px-2 py-0.5 text-xs text-ink-700">
                      {p.status.toLowerCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data?.meta && data.meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-ink-500">Page {data.meta.page} of {data.meta.totalPages}</span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-card border border-ink-100 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={!data.meta.hasNext}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-card border border-ink-100 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
