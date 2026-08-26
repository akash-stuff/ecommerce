import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { bannerService, productService } from '@/services/store.service';
import { BannerLink } from '@/components/BannerLink';
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

/** One rhythm for every section, so the page reads as one document. */
const SHELL = 'mx-auto max-w-7xl px-4 sm:px-8';
const BLOCK = 'py-16 sm:py-24';

/**
 * A tenant's scheduled hero banner when there is one, otherwise the store's own
 * name and description.
 *
 * The typographic hero is the fallback rather than the banner being an extra
 * section, because two stacked heroes is not a layout anyone chose. While the
 * banner query is in flight nothing is rendered in its place — swapping a text
 * hero for an image a moment later is a worse first impression than a brief gap.
 */
function Hero() {
  const store = useStore();

  const banners = useQuery({
    queryKey: ['banners', 'HOME_HERO'],
    queryFn: () => bannerService.live('HOME_HERO'),
    staleTime: 5 * 60_000,
  });

  if (banners.isLoading) return <div className="h-[26rem] sm:h-[34rem]" />;

  // The API requires an image for this placement; the check keeps a row written
  // before that rule existed from rendering an empty <img>.
  const banner = banners.data?.find((b) => b.imageUrl);

  if (banner?.imageUrl) {
    return (
      <section>
        <BannerLink href={banner.linkUrl} className="group relative block overflow-hidden">
          <img
            src={banner.imageUrl}
            alt={banner.title ?? ''}
            /* A slow zoom on hover. Enough to feel alive, not enough to
               distract — and disabled entirely under prefers-reduced-motion by
               the global rule in index.css. */
            className="h-[26rem] w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.04] sm:h-[34rem]"
          />

          {/* Scrim always, not only when there is text: an unknown photograph
              needs its edges anchored or the header floats on top of nothing. */}
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950/75 via-ink-950/25 to-ink-950/10" />

          {(banner.title || banner.subtitle) && (
            <div className={`absolute inset-x-0 bottom-0 ${SHELL} pb-12 sm:pb-20`}>
              <div className="max-w-2xl">
                {banner.title && (
                  <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-white sm:text-6xl">
                    {banner.title}
                  </h1>
                )}
                {banner.subtitle && (
                  <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/85 sm:text-lg">
                    {banner.subtitle}
                  </p>
                )}
                <span className="mt-7 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-ink-950 transition-transform group-hover:translate-x-1">
                  Shop the collection
                  <ArrowRight size={15} />
                </span>
              </div>
            </div>
          )}
        </BannerLink>
      </section>
    );
  }

  return (
    <section className={`${SHELL} py-20 sm:py-32`}>
      <div className="max-w-3xl">
        {/* An eyebrow gives the headline something to sit under and turns a bare
            store name into a masthead. */}
        <p className="surface-muted text-[11px] font-semibold uppercase tracking-[0.22em]">
          {store.template?.name ?? 'Now open'}
        </p>
        <h1 className="surface-strong mt-5 font-display text-5xl leading-[1.03] tracking-tight sm:text-7xl">
          {store.name}
        </h1>
        {store.description && (
          <p className="surface-muted mt-6 max-w-xl text-base leading-relaxed sm:text-lg">
            {store.description}
          </p>
        )}
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            to="/shop"
            className="group inline-flex items-center gap-2 rounded-full bg-brand px-7 py-3.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
          >
            Shop everything
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/shop?sort=createdAt:desc"
            className="surface-line rounded-full border px-6 py-3.5 text-sm font-medium text-ink-900 transition-colors hover:border-brand hover:text-brand"
          >
            New arrivals
          </Link>
        </div>
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
      eyebrow="Selected"
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
      eyebrow="Just in"
      title="New arrivals"
      query={query}
      emptyTitle="Nothing new just yet"
      href="/shop?sort=createdAt:desc"
    />
  );
}

/**
 * Category tiles, using the category's own image when it has one.
 *
 * The image is the reason this is worth a section at all — a grid of grey boxes
 * with words in them is a table of contents, not a shop window. Categories
 * without an image fall back to a brand-tinted panel rather than a blank one.
 */
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
    <section className={`${SHELL} ${BLOCK}`}>
      <SectionHead eyebrow="Browse" title="Shop by category" />

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category, index) => (
          <Link
            key={category.id}
            to={`/category/${category.slug}`}
            className={`group relative overflow-hidden rounded-2xl ${
              // The first tile spans two columns on wide screens, so the grid
              // has a focal point instead of six equal boxes.
              index === 0 ? 'lg:col-span-2 lg:row-span-1' : ''
            }`}
          >
            <div className={index === 0 ? 'aspect-[16/9]' : 'aspect-[4/3]'}>
              {category.imageUrl ? (
                <img
                  src={category.imageUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-brand/15 via-brand/5 to-brand-secondary/10" />
              )}
            </div>

            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/70 via-ink-950/10 to-transparent" />

            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
              <div>
                <span className="font-display text-lg tracking-tight text-white sm:text-xl">
                  {category.name}
                </span>
                {category.children.length > 0 && (
                  <span className="mt-0.5 block text-xs text-white/70">
                    {category.children.length} subcategories
                  </span>
                )}
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-all group-hover:bg-white group-hover:text-ink-950">
                <ArrowRight size={15} />
              </span>
            </div>
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
    <section className={`${SHELL} ${BLOCK}`}>
      {/* A panel rather than a full-bleed band: the page background is the
          tenant's choice now, and a band would cover the part of it people
          actually see. */}
      <div className="relative overflow-hidden rounded-3xl bg-brand px-6 py-14 text-center sm:px-16 sm:py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
        <div className="relative mx-auto max-w-lg">
          <h2 className="font-display text-2xl tracking-tight text-white sm:text-4xl">
            Hear from {store.name}
          </h2>
          <p className="mt-3 text-sm text-white/80 sm:text-base">
            Leave your email and the store will be in touch about new arrivals.
          </p>

          <form
            onSubmit={(e) => e.preventDefault()}
            className="mx-auto mt-8 flex max-w-md flex-col gap-2 sm:flex-row"
          >
            <label htmlFor="newsletter-email" className="sr-only">
              Email address
            </label>
            <input
              id="newsletter-email"
              type="email"
              required
              placeholder="you@example.com"
              className="min-w-0 flex-1 rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm text-white placeholder:text-white/60 focus:border-white focus:outline-none"
            />
            <button
              type="submit"
              disabled
              title="Mailing list signup is not connected yet"
              className="rounded-full bg-white px-6 py-3 text-sm font-medium text-ink-950 disabled:opacity-50"
            >
              Notify me
            </button>
          </form>
          <p className="mt-3 text-xs text-white/60">
            Signups are not connected to a mailing list yet.
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function SectionHead({
  eyebrow,
  title,
  href,
}: {
  eyebrow: string;
  title: string;
  href?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="surface-muted text-[11px] font-semibold uppercase tracking-[0.18em]">
          {eyebrow}
        </p>
        <h2 className="surface-strong mt-2 font-display text-2xl tracking-tight sm:text-3xl">
          {title}
        </h2>
      </div>
      {href && (
        <Link
          to={href}
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-ink-700 transition-colors hover:text-brand"
        >
          See all
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

interface ProductQueryLike {
  data?: { items: Product[] } | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** Featured and New arrivals differ only in title and query. */
function ProductSection({
  eyebrow,
  title,
  query,
  emptyTitle,
  emptyHint,
  href,
}: {
  eyebrow: string;
  title: string;
  query: ProductQueryLike;
  emptyTitle: string;
  emptyHint?: string;
  href?: string;
}) {
  const items = query.data?.items ?? [];

  return (
    <section className={`${SHELL} ${BLOCK}`}>
      <SectionHead eyebrow={eyebrow} title={title} href={items.length > 0 ? href : undefined} />

      {query.isLoading && (
        <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className="skeleton aspect-[4/5] rounded-2xl" />
              <div className="skeleton mt-4 h-3.5 w-3/4" />
              <div className="skeleton mt-2 h-3.5 w-1/3" />
            </div>
          ))}
          <span className="sr-only">Loading products</span>
        </div>
      )}

      {query.isError && (
        <div className="surface surface-line mt-10 rounded-2xl border p-10 text-center">
          <p className="text-sm text-ink-700">Products couldn&apos;t be loaded.</p>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="mt-3 text-sm font-medium text-brand"
          >
            Try again
          </button>
        </div>
      )}

      {query.data && items.length === 0 && (
        <div className="surface-line mt-10 rounded-2xl border border-dashed p-14 text-center">
          <p className="surface-strong text-sm font-medium">{emptyTitle}</p>
          {emptyHint && <p className="surface-muted mt-1 text-sm">{emptyHint}</p>}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The product card.
 *
 * A 4:5 frame rather than a square: most product photography is shot portrait,
 * and a square crop cuts the top off a garment or the base off a bottle. The
 * discount badge is computed rather than stored — a `compareAtPrice` above the
 * price already *is* the claim, and a second stored field could disagree with it.
 */
function ProductCard({ product }: { product: Product }) {
  const store = useStore();

  const price = Number(product.price);
  const was = product.compareAtPrice ? Number(product.compareAtPrice) : null;
  const off = was && was > price ? Math.round(((was - price) / was) * 100) : null;

  return (
    <Link to={`/product/${product.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-ink-50">
        {product.images[0] ? (
          <img
            src={product.images[0].url}
            alt={product.images[0].altText ?? product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-ink-50 to-ink-100 text-xs text-ink-400">
            No image
          </div>
        )}

        {off !== null && (
          <span className="absolute left-3 top-3 rounded-full bg-ink-950 px-2.5 py-1 text-[11px] font-semibold text-white">
            −{off}%
          </span>
        )}

        {/* Slides up on hover on a pointer device; always legible on touch,
            where hover never fires, because the card itself is the link. */}
        <span className="pointer-events-none absolute inset-x-3 bottom-3 translate-y-3 rounded-full bg-white/95 py-2.5 text-center text-xs font-medium text-ink-950 opacity-0 backdrop-blur transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          View product
        </span>
      </div>

      <h3 className="surface-strong mt-4 text-sm font-medium leading-snug transition-colors group-hover:text-brand">
        {product.name}
      </h3>
      <p className="mt-1.5 flex items-baseline gap-2 text-sm">
        <span className="numeric surface-strong font-semibold">
          {formatMoney(product.price, store.currency)}
        </span>
        {was && was > price && (
          <span className="numeric surface-muted text-xs line-through">
            {formatMoney(product.compareAtPrice!, store.currency)}
          </span>
        )}
      </p>
    </Link>
  );
}
