import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { productService } from '@/services/store.service';
import { categoryService } from '@/services/admin.service';
import { apiClient, unwrap } from '@/services/api-client';
import { ProductCard } from '@/features/storefront/sections';
import type { CategoryNode } from '@/types/api';

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
  const [params, setParams] = useSearchParams();

  const page = Number(params.get('page') ?? 1);
  const search = params.get('q') ?? '';
  const sort = params.get('sort') ?? 'createdAt:desc';
  const [sortBy, sortOrder] = sort.split(':');
  // Filters live in the URL alongside the rest, so a filtered view is linkable.
  const minPrice = params.get('min') ?? '';
  const maxPrice = params.get('max') ?? '';
  const inStockOnly = params.get('inStock') === '1';

  const tree = useQuery({ queryKey: ['storefront-categories'], queryFn: categoryService.tree });

  const activeCategory = useMemo(
    () => (categorySlug ? findBySlug(tree.data ?? [], categorySlug) : null),
    [tree.data, categorySlug],
  );

  const facets = useQuery({
    queryKey: ['facets', search, activeCategory?.id ?? null, minPrice, maxPrice, inStockOnly],
    queryFn: () =>
      unwrap<Facets>(
        apiClient.get('/products/facets', {
          params: {
            search: search || undefined,
            categoryId: activeCategory?.id,
            minPrice: minPrice || undefined,
            maxPrice: maxPrice || undefined,
          },
        }),
      ),
    enabled: !categorySlug || Boolean(activeCategory) || tree.isError,
  });

  const products = useQuery({
    queryKey: ['shop', page, search, sort, activeCategory?.id ?? null, categorySlug, minPrice, maxPrice, inStockOnly],
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
        minPrice: minPrice || undefined,
        maxPrice: maxPrice || undefined,
        inStock: inStockOnly || undefined,
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
    <div className="mx-auto page-container px-4 py-12 sm:px-6">
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
                  {node.name}{' '}
                  <span className="text-xs text-ink-300">
                    {facetCount(facets.data, node.id)}
                  </span>
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
          {facets.data && (
            <>
              <h2 className="mt-8 text-sm font-medium text-ink-950">Price</h2>
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={minPrice}
                  placeholder={String(Math.floor(Number(facets.data.price.min)))}
                  onChange={(e) => update({ min: e.target.value })}
                  aria-label="Minimum price"
                  className="w-full min-w-0 rounded-card border border-ink-300 px-2 py-1.5 text-sm"
                />
                <span className="text-xs text-ink-500">to</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={maxPrice}
                  placeholder={String(Math.ceil(Number(facets.data.price.max)))}
                  onChange={(e) => update({ max: e.target.value })}
                  aria-label="Maximum price"
                  className="w-full min-w-0 rounded-card border border-ink-300 px-2 py-1.5 text-sm"
                />
              </div>

              <h2 className="mt-8 text-sm font-medium text-ink-950">Availability</h2>
              <label className="mt-3 flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => update({ inStock: e.target.checked ? '1' : null })}
                  className="h-4 w-4 rounded border-ink-300"
                />
                In stock ({facets.data.availability.inStock})
              </label>

              {facets.data.brands.length > 0 && (
                <>
                  <h2 className="mt-8 text-sm font-medium text-ink-950">Brand</h2>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {facets.data.brands.map((brand) => (
                      <li key={brand.id}>
                        <button
                          onClick={() => update({ brand: brand.id })}
                          className="text-ink-700 hover:text-brand"
                        >
                          {brand.name}{' '}
                          <span className="text-xs text-ink-300">({brand.count})</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {(minPrice || maxPrice || inStockOnly) && (
                <button
                  onClick={() => update({ min: null, max: null, inStock: null })}
                  className="mt-6 text-xs text-ink-500 underline"
                >
                  Clear filters
                </button>
              )}
            </>
          )}
        </aside>

        <div>
          {products.isLoading && (
            <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-3">
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
                <ProductCard key={product.id} product={product} />
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


interface Facets {
  categories: { id: string; name: string; slug: string; count: number }[];
  brands: { id: string; name: string; count: number }[];
  price: { min: string; max: string };
  availability: { inStock: number; outOfStock: number };
  total: number;
}

/**
 * Two different absences, told apart.
 *
 * Before the counts load there is no number to show, so nothing is shown. Once
 * they have loaded, a category missing from the response genuinely has no
 * matches under the current filters, and "(0)" says that — which is what tells
 * a shopper the filter is why the category looks empty.
 */
function facetCount(facets: Facets | undefined, categoryId: string): string {
  if (!facets) return '';
  const hit = facets.categories.find((c) => c.id === categoryId);
  return `(${hit?.count ?? 0})`;
}

function findBySlug(nodes: CategoryNode[], slug: string): CategoryNode | null {
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const hit = findBySlug(node.children ?? [], slug);
    if (hit) return hit;
  }
  return null;
}
