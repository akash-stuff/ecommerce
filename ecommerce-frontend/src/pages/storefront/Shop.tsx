import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { productService } from '@/services/store.service';
import { categoryService } from '@/services/admin.service';
import { useStore } from '@/features/theme/ThemeProvider';
import { formatMoney } from '@/utils/format';
import type { CategoryNode, Product } from '@/types/api';

const SORTS = [
  { value: 'createdAt:desc', label: 'Newest' },
  { value: 'price:asc', label: 'Price: low to high' },
  { value: 'price:desc', label: 'Price: high to low' },
  { value: 'name:asc', label: 'Name: A–Z' },
];

/**
 * The catalogue, also serving `/search?q=` and `/category/:slug`.
 *
 * Filters live in the URL rather than component state so a filtered view can be
 * linked, shared and reloaded — which is what a shopper expects from a shop
 * page, and what a crawler needs to see distinct listings.
 */
export default function Shop({ categorySlug }: { categorySlug?: string }) {
  const store = useStore();
  const [params, setParams] = useSearchParams();

  const page = Number(params.get('page') ?? 1);
  const search = params.get('q') ?? '';
  const sort = params.get('sort') ?? 'createdAt:desc';
  const [sortBy, sortOrder] = sort.split(':');

  const tree = useQuery({ queryKey: ['storefront-categories'], queryFn: categoryService.tree });

  const activeCategory = useMemo(
    () => (categorySlug ? findBySlug(tree.data ?? [], categorySlug) : null),
    [tree.data, categorySlug],
  );

  const products = useQuery({
    queryKey: ['shop', page, search, sort, activeCategory?.id ?? null, categorySlug],
    // A category route must not fall back to "everything" while the tree loads,
    // or the shopper sees the whole catalogue flash past before it narrows.
    enabled: !categorySlug || Boolean(activeCategory) || tree.isError,
    queryFn: () =>
      productService.list({
        page,
        limit: 12,
        status: 'ACTIVE',
        sortBy,
        sortOrder,
        search: search || undefined,
        categoryId: activeCategory?.id,
      }),
    placeholderData: (previous) => previous,
  });

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    // Any change of filter invalidates the page number.
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  const title = activeCategory?.name ?? (search ? `Results for “${search}”` : 'Shop');
  const items = products.data?.items ?? [];
  const meta = products.data?.meta;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-ink-950">{title}</h1>
          {meta && (
            <p className="mt-1 text-sm text-ink-500">
              {meta.total} {meta.total === 1 ? 'product' : 'products'}
            </p>
          )}
        </div>

        <label className="text-sm">
          <span className="sr-only">Sort by</span>
          <select
            value={sort}
            onChange={(e) => update({ sort: e.target.value })}
            className="rounded-card border border-ink-300 bg-white px-3 py-2 text-sm"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[12rem_1fr]">
        <aside>
          <h2 className="text-sm font-medium text-ink-950">Categories</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li>
              <Link
                to="/shop"
                className={!categorySlug ? 'font-medium text-brand' : 'text-ink-700 hover:text-brand'}
              >
                Everything
              </Link>
            </li>
            {(tree.data ?? []).map((node) => (
              <li key={node.id}>
                <Link
                  to={`/category/${node.slug}`}
                  className={
                    node.slug === categorySlug
                      ? 'font-medium text-brand'
                      : 'text-ink-700 hover:text-brand'
                  }
                >
                  {node.name}
                </Link>
                {node.children.length > 0 && (
                  <ul className="ml-3 mt-1 space-y-1">
                    {node.children.map((child) => (
                      <li key={child.id}>
                        <Link
                          to={`/category/${child.slug}`}
                          className={
                            child.slug === categorySlug
                              ? 'font-medium text-brand'
                              : 'text-ink-500 hover:text-brand'
                          }
                        >
                          {child.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </aside>

        <div>
          {products.isLoading && (
            <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-square rounded-card bg-ink-100" />
                  <div className="mt-3 h-4 w-3/4 rounded bg-ink-100" />
                </div>
              ))}
            </div>
          )}

          {products.isError && (
            <div className="rounded-card border border-ink-100 p-10 text-center">
              <p className="text-sm text-ink-700">Products couldn't be loaded.</p>
              <button
                onClick={() => products.refetch()}
                className="mt-3 text-sm font-medium text-brand"
              >
                Try again
              </button>
            </div>
          )}

          {products.data && items.length === 0 && (
            <div className="rounded-card border border-dashed border-ink-300 p-16 text-center">
              <p className="text-sm text-ink-700">
                {search ? 'Nothing matches that search' : 'Nothing here yet'}
              </p>
              <p className="mt-1 text-sm text-ink-500">
                {search ? 'Try a different word, or browse a category.' : 'Check back soon.'}
              </p>
            </div>
          )}

          {items.length > 0 && (
            <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
              {items.map((product) => (
                <Card key={product.id} product={product} currency={store.currency} />
              ))}
            </div>
          )}

          {meta && meta.totalPages > 1 && (
            <div className="mt-10 flex items-center justify-between text-sm">
              <span className="text-ink-500">
                Page {meta.page} of {meta.totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={meta.page === 1}
                  onClick={() => update({ page: String(meta.page - 1) })}
                  className="rounded-card border border-ink-300 px-3 py-1.5 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  disabled={!meta.hasNext}
                  onClick={() => update({ page: String(meta.page + 1) })}
                  className="rounded-card border border-ink-300 px-3 py-1.5 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ product, currency }: { product: Product; currency: string }) {
  return (
    <Link to={`/product/${product.slug}`} className="group">
      <div className="aspect-square overflow-hidden rounded-card bg-ink-50">
        {product.images[0] ? (
          <img
            src={product.images[0].url}
            alt={product.images[0].altText ?? product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-ink-300">
            No image
          </div>
        )}
      </div>
      <h3 className="mt-3 text-sm text-ink-900 group-hover:text-brand">{product.name}</h3>
      <p className="mt-1 flex items-baseline gap-2 text-sm">
        <span className="font-medium text-ink-950">{formatMoney(product.price, currency)}</span>
        {product.compareAtPrice && (
          <span className="text-xs text-ink-300 line-through">
            {formatMoney(product.compareAtPrice, currency)}
          </span>
        )}
      </p>
      {product.stock === 0 && <p className="mt-1 text-xs text-red-600">Out of stock</p>}
    </Link>
  );
}

function findBySlug(nodes: CategoryNode[], slug: string): CategoryNode | null {
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const hit = findBySlug(node.children ?? [], slug);
    if (hit) return hit;
  }
  return null;
}
