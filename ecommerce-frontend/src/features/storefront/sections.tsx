import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { productService } from '@/services/store.service';
import { categoryService } from '@/services/admin.service';
import { useStore } from '@/features/theme/ThemeProvider';
import { formatMoney } from '@/utils/format';
import type { Product } from '@/types/api';

/**
 * The homepage sections a tenant can switch on.
 *
 * `Theme.homepageLayout` is an ordered list of these keys, so the shopkeeper
 * controls both which sections appear and in what order. A key the storefront
 * does not implement is skipped rather than crashing the page — themes outlive
 * deployments and a seeded template may name a section this build removed.
 */
export const SECTIONS = {
  hero: Hero,
  featured: Featured,
  categories: Categories,
  newArrivals: NewArrivals,
  newsletter: Newsletter,
} as const;

export type SectionKey = keyof typeof SECTIONS;

export function isSectionKey(value: string): value is SectionKey {
  return value in SECTIONS;
}

function Hero() {
  const store = useStore();

  return (
    <section className="border-b border-ink-100">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <h1 className="max-w-2xl font-display text-4xl leading-tight tracking-tight text-ink-950 sm:text-5xl">
          {store.name}
        </h1>
        {store.description && (
          <p className="mt-4 max-w-lg text-base text-ink-500">{store.description}</p>
        )}
        <Link
          to="/shop"
          className="mt-8 inline-block rounded-card bg-brand px-6 py-3 text-sm font-medium text-white"
        >
          Shop everything
        </Link>
      </div>
    </section>
  );
}

function Featured() {
  const query = useQuery({
    queryKey: ['products', 'featured'],
    queryFn: () => productService.list({ featured: true, limit: 8 }),
  });

  return (
    <ProductSection
      title="Featured"
      query={query}
      emptyTitle="Nothing here yet"
      emptyHint="New products will appear on this page."
    />
  );
}

function NewArrivals() {
  const query = useQuery({
    queryKey: ['products', 'new-arrivals'],
    queryFn: () =>
      productService.list({ limit: 8, sortBy: 'createdAt', sortOrder: 'desc', status: 'ACTIVE' }),
  });

  return (
    <ProductSection
      title="New arrivals"
      query={query}
      emptyTitle="Nothing new just yet"
      href="/shop?sort=createdAt:desc"
    />
  );
}

function Categories() {
  const { data } = useQuery({
    queryKey: ['storefront-categories'],
    queryFn: categoryService.tree,
    staleTime: 5 * 60_000,
  });

  const categories = (data ?? []).slice(0, 6);
  // Nothing to browse by — showing an empty grid would look broken.
  if (categories.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h2 className="font-display text-xl tracking-tight text-ink-950">Browse</h2>
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {categories.map((category) => (
          <Link
            key={category.id}
            to={`/category/${category.slug}`}
            className="group relative overflow-hidden rounded-card bg-ink-50 p-6 transition-colors hover:bg-ink-100"
          >
            <span className="text-sm text-ink-900 group-hover:text-brand">{category.name}</span>
            {category.children.length > 0 && (
              <span className="mt-1 block text-xs text-ink-500">
                {category.children.length} subcategories
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * Collects an address only. Nothing is wired to a mailing list yet, so it says
 * what will actually happen rather than implying a subscription exists.
 */
function Newsletter() {
  const store = useStore();

  return (
    <section className="border-t border-ink-100 bg-ink-50">
      <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <h2 className="font-display text-xl tracking-tight text-ink-950">
          Hear from {store.name}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
          Leave your email and the store will be in touch about new arrivals.
        </p>
        <form
          onSubmit={(e) => e.preventDefault()}
          className="mx-auto mt-6 flex max-w-sm gap-2"
        >
          <label htmlFor="newsletter-email" className="sr-only">
            Email address
          </label>
          <input
            id="newsletter-email"
            type="email"
            required
            placeholder="you@example.com"
            className="min-w-0 flex-1 rounded-card border border-ink-300 bg-white px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled
            title="Mailing list signup is not connected yet"
            className="rounded-card bg-brand px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Notify me
          </button>
        </form>
        <p className="mt-3 text-xs text-ink-500">
          Signups are not connected to a mailing list yet.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

interface ProductQueryLike {
  data?: { items: Product[] } | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** Featured and New arrivals differ only in title and query. */
function ProductSection({
  title,
  query,
  emptyTitle,
  emptyHint,
  href,
}: {
  title: string;
  query: ProductQueryLike;
  emptyTitle: string;
  emptyHint?: string;
  href?: string;
}) {
  const store = useStore();
  const items = query.data?.items ?? [];

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xl tracking-tight text-ink-950">{title}</h2>
        {href && items.length > 0 && (
          <Link to={href} className="text-sm text-ink-500 hover:text-brand">
            See all
          </Link>
        )}
      </div>

      {query.isLoading && (
        <div className="mt-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square rounded-card bg-ink-100" />
              <div className="mt-3 h-4 w-3/4 rounded bg-ink-100" />
              <div className="mt-2 h-4 w-1/3 rounded bg-ink-100" />
            </div>
          ))}
        </div>
      )}

      {query.isError && (
        <div className="mt-8 rounded-card border border-ink-100 p-8 text-center">
          <p className="text-sm text-ink-700">Products couldn't be loaded.</p>
          <button onClick={() => query.refetch()} className="mt-3 text-sm font-medium text-brand">
            Try again
          </button>
        </div>
      )}

      {query.data && items.length === 0 && (
        <div className="mt-8 rounded-card border border-dashed border-ink-300 p-12 text-center">
          <p className="text-sm text-ink-700">{emptyTitle}</p>
          {emptyHint && <p className="mt-1 text-sm text-ink-500">{emptyHint}</p>}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
          {items.map((product) => (
            <Link key={product.id} to={`/product/${product.slug}`} className="group">
              <div className="aspect-square overflow-hidden rounded-card bg-ink-50">
                {product.images[0] ? (
                  <img
                    src={product.images[0].url}
                    alt={product.images[0].altText ?? product.name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-ink-300">
                    No image
                  </div>
                )}
              </div>
              <h3 className="mt-3 text-sm text-ink-900 group-hover:text-brand">{product.name}</h3>
              <p className="mt-1 flex items-baseline gap-2 text-sm">
                <span className="font-medium text-ink-950">
                  {formatMoney(product.price, store.currency)}
                </span>
                {product.compareAtPrice && (
                  <span className="text-xs text-ink-300 line-through">
                    {formatMoney(product.compareAtPrice, store.currency)}
                  </span>
                )}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
