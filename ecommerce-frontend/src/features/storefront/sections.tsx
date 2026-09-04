import { useState } from 'react';
import { Spinner } from '@/components/Spinner';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  BadgeIndianRupee,
  Check,
  Clock,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
} from 'lucide-react';
import { bannerService, newsletterService, productService } from '@/services/store.service';
import { BannerLink } from '@/components/BannerLink';
import { SaveButton } from '@/components/SaveButton';
import { Reveal } from './Reveal';
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
  promise: Promise_,
  featured: Featured,
  categories: Categories,
  newArrivals: NewArrivals,
  newsletter: Newsletter,
} as const;

export type SectionKey = keyof typeof SECTIONS;

export function isSectionKey(value: string): value is SectionKey {
  return value in SECTIONS;
}

/**
 * The icons a promise row may name.
 *
 * Keyed by the server's allowlist rather than by a free string, so a row can
 * never name a component that does not exist. An unknown key falls back to the
 * check mark instead of rendering a hole where the icon should be — an older
 * storefront build must not break on a row a newer admin wrote.
 */
const PROMISE_ICONS: Record<string, typeof Truck> = {
  truck: Truck,
  clock: Clock,
  rupee: BadgeIndianRupee,
  shield: ShieldCheck,
  chat: MessageCircle,
  refresh: RefreshCw,
};

/**
 * The strip of things this shop promises.
 *
 * The wording arrives finished from the server — either written by the
 * shopkeeper in Appearance, or derived from their shipping methods when they
 * have written none. Nothing is composed here, which is the point: a tile that
 * said one thing when authored and another when derived would be two
 * implementations of the same sentence.
 *
 * ## Why it hides itself
 *
 * Under two tiles the row stops reading as a row — one lonely claim centred in
 * a band looks like the other three failed to load. Nothing is better than
 * that, so the section renders null.
 */
function Promise_() {
  const tiles = useStore().promises ?? [];

  if (tiles.length < 2) return null;

  /*
    The track count follows the tile count, because the tile count is not known
    until the shop's configuration is read. A fixed four-column grid leaves a
    visible empty quarter on the common case of three, which reads as a tile
    that failed to load rather than as a shop that offers three things.

    Written as whole class names: Tailwind scans source text, so a template
    literal like `lg:grid-cols-${n}` compiles to nothing at all.
  */
  const columns =
    tiles.length >= 4 ? 'lg:grid-cols-4' : tiles.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2';

  return (
    <section className="border-y border-ink-100 bg-brand-wash">
      <div className={`${SHELL} py-10 sm:py-12`}>
        {/*
          `sm:grid-cols-2` before four: at 640px four tiles are 160px each and
          "Pay when your order arrives" wraps to three lines. Two rows of two
          reads; one row of four crammed does not.
        */}
        <div className={`grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2 ${columns}`}>
          {tiles.map((tile, i) => {
            const Icon = PROMISE_ICONS[tile.icon] ?? Check;
            return (
              <Reveal key={`${tile.title}-${i}`} delay={i * 70}>
                <div className="flex items-start gap-3.5">
                  <Icon size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-brand" />
                  <div className="min-w-0">
                    <p className="surface-strong text-sm font-medium">{tile.title}</p>
                    <p className="surface-muted mt-1 text-sm leading-relaxed">{tile.detail}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** One rhythm for every section, so the page reads as one document. */
const SHELL = 'mx-auto page-container px-4 sm:px-8';
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
    <section className="relative overflow-hidden">
      {/*
        An ambient wash in the store's own colours.

        The typographic hero had nothing behind it, so a shop without a banner
        opened on blank paper. Two radials read from `--brand-primary` and
        `--brand-secondary` give it a stage without inventing artwork — and
        because they read the variables, they are that shop's colours rather
        than a hard-coded palette that would be wrong for every other shop.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(46rem 26rem at 6% -12%, rgb(var(--brand-primary) / 0.13), transparent 62%),' +
            'radial-gradient(34rem 22rem at 98% 2%, rgb(var(--brand-secondary) / 0.15), transparent 62%)',
        }}
      />

      <div className={`relative ${SHELL} py-20 sm:py-32`}>
      <div className="max-w-3xl">
        {/* An eyebrow gives the headline something to sit under and turns a bare
            store name into a masthead. */}
        <p className="surface-muted inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em]">
          <span className="h-1 w-1 rounded-full bg-brand-secondary" />
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
        {/* `items-stretch`: the filled pill has no border and the outlined one
            does, so centring them leaves their tops and bottoms a pixel apart.
            See the same note on the product page's action row. */}
        <div className="mt-10 flex flex-wrap items-stretch gap-3">
          <Link
            to="/shop"
            className="group inline-flex items-center gap-2 rounded-full bg-brand px-7 py-3.5 text-sm font-medium text-white shadow-glow-store transition-all hover:-translate-y-0.5 hover:shadow-lifted"
          >
            Shop everything
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/shop?sort=createdAt:desc"
            className="surface-card surface-raise inline-flex items-center rounded-full border px-6 py-3.5 text-sm font-medium text-ink-900 hover:border-brand hover:text-brand"
          >
            New arrivals
          </Link>
        </div>
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
 * The "shop by category" row.
 *
 * A framed tile per category: the photograph in a brand-coloured mount, and a
 * caption bar under it carrying the category name, what it saves you, and the
 * invitation. The frame is what makes a row of six read as a set of cards
 * rather than as six loose photographs.
 *
 * The discount line is real. It comes from `/categories/showcase`, which
 * computes the spread from `compareAtPrice` against `price` across that
 * category's live products — the same arithmetic behind the badge on a product
 * card, so a tile promising "30–70% OFF" promises something the shopper will
 * actually find inside. Categories with nothing reduced show their product
 * count instead of a made-up number, and the row is dropped entirely when the
 * shop has no categories with stock in them.
 */
function Categories() {
  const { data } = useQuery({
    queryKey: ['storefront-category-tiles'],
    queryFn: categoryService.showcase,
    staleTime: 5 * 60_000,
  });

  const categories = data ?? [];
  // Nothing to browse by — a row of dead ends looks worse than no row.
  if (categories.length === 0) return null;

  return (
    <section className={`${SHELL} ${BLOCK}`}>
      <Reveal>
        <SectionHead eyebrow="Browse" title="Shop by category" href="/shop" />
      </Reveal>

      {/*
        A scroller below `sm`, a grid above it.

        Six tiles will not fit a phone at a legible size, and squeezing them
        into two columns turns the row into a block. Swiping is what a shopper
        expects of a category rail on a phone; `snap-x` makes it stop on a tile
        rather than anywhere.
      */}
      <div className="-mx-4 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
        {categories.map((category, i) => (
          <Reveal
            key={category.id}
            delay={(i % 6) * 60}
            className="w-[62%] shrink-0 snap-start sm:w-auto"
          >
          <Link
            to={`/category/${category.slug}`}
            className="group block"
          >
            {/*
              The mount. A gradient in the shop's own two colours, so the frame
              belongs to the store rather than being a fixed blue — this is the
              part of the reference design that has to be per-tenant.
            */}
            <div
              className="rounded-2xl p-[3px] shadow-card transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-lifted"
              style={{
                backgroundImage:
                  'linear-gradient(160deg, rgb(var(--brand-primary) / 0.85), rgb(var(--brand-secondary) / 0.75))',
              }}
            >
              <div className="overflow-hidden rounded-[0.85rem] bg-white">
                <div className="aspect-[4/5] overflow-hidden">
                  {category.imageUrl ? (
                    <img
                      src={category.imageUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center"
                      style={{
                        backgroundImage:
                          'linear-gradient(135deg, rgb(var(--brand-primary) / 0.10), rgb(var(--brand-secondary) / 0.10))',
                      }}
                    >
                      <ShoppingBag
                        size={26}
                        strokeWidth={1.25}
                        className="text-brand opacity-30"
                        aria-hidden="true"
                      />
                    </div>
                  )}
                </div>

                {/* The caption sits inside the frame, on a tint of the shop's
                    colour, so the mount reads as one object rather than as a
                    border round a photo. */}
                <div
                  className="px-3 py-3 text-center"
                  style={{ backgroundColor: 'rgb(var(--brand-primary) / 0.07)' }}
                >
                  <p className="truncate text-[13px] font-medium text-ink-800">{category.name}</p>

                  <p className="numeric mt-0.5 text-base font-bold leading-tight text-brand sm:text-lg">
                    {category.discount
                      ? category.discount.min === category.discount.max
                        ? `${category.discount.max}% OFF`
                        : `${category.discount.min}-${category.discount.max}% OFF`
                      : `${category.productCount} ${category.productCount === 1 ? 'item' : 'items'}`}
                  </p>

                  <p className="mt-0.5 text-xs text-ink-600 underline-offset-2 group-hover:underline">
                    Shop Now
                  </p>
                </div>
              </div>
            </div>
          </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/**
 * The mailing-list panel.
 *
 * On success the form is replaced by a confirmation rather than a corner toast:
 * the panel is what the shopper is looking at, and leaving a filled-in box
 * behind invites a second submission. The reply is identical for a new address,
 * a repeat and one that had opted out — the server will not say which, so this
 * cannot be used to test whether someone shops here.
 */
function Newsletter() {
  const store = useStore();
  const [email, setEmail] = useState('');

  const subscribe = useMutation({
    mutationFn: () => newsletterService.subscribe(email),
  });

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

          {subscribe.isSuccess ? (
            /* `role="status"` so the swap is announced; the heading above stays
               put, so a screen reader is not left wondering what changed. */
            <div role="status" className="mt-4">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm text-white backdrop-blur">
                <Check size={15} className="shrink-0" />
                You are on the list — check your inbox.
              </p>
            </div>
          ) : (
            <>
              <p className="mt-3 text-sm text-white/80 sm:text-base">
                Leave your email and the store will be in touch about new arrivals.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!subscribe.isPending) subscribe.mutate();
                }}
                className="mx-auto mt-8 flex max-w-md flex-col gap-2 sm:flex-row"
              >
                <label htmlFor="newsletter-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="newsletter-email"
                  type="email"
                  required
                  value={email}
                  disabled={subscribe.isPending}
                  autoComplete="email"
                  placeholder="you@example.com"
                  onChange={(e) => setEmail(e.target.value)}
                  className="min-w-0 flex-1 rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm text-white placeholder:text-white/60 focus:border-white focus:outline-none disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={subscribe.isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-ink-950 transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {subscribe.isPending && <Spinner size={14} tone="current" />}
                  {subscribe.isPending ? 'Adding you…' : 'Notify me'}
                </button>
              </form>

              {/* Inline rather than a toast, for the same reason as the
                  confirmation: the answer belongs next to the field. */}
              {subscribe.isError && (
                <p
                  role="alert"
                  className="mx-auto mt-4 inline-flex max-w-md items-start gap-2 rounded-2xl bg-black/25 px-4 py-2 text-left text-sm text-white backdrop-blur"
                >
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>
                    {(subscribe.error as { message?: string } | null)?.message ??
                      'That did not go through. Try again in a moment.'}
                  </span>
                </p>
              )}
            </>
          )}
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
        {/* A short rule in the shop's colour, so every section opens the same
            way and the eyebrow is anchored rather than floating. */}
        <p className="surface-muted flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.18em]">
          <span className="h-px w-6 bg-brand" />
          {eyebrow}
        </p>
        <h2 className="surface-strong mt-2.5 font-display text-2xl tracking-tight sm:text-3xl">
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
      <Reveal>
        <SectionHead eyebrow={eyebrow} title={title} href={items.length > 0 ? href : undefined} />
      </Reveal>

      {query.isLoading && (
        <div className="mt-10 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
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
        <div className="mt-10 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {items.map((product, i) => (
            /*
              Staggered by column, not by index: `i % 4` means the delay resets
              on each row, so row three does not wait three quarters of a second
              behind row one. Capped small — this is holding real products back
              from a shopper who has already scrolled to them.
            */
            <Reveal key={product.id} delay={(i % 4) * 70}>
              <ProductCard product={product} />
            </Reveal>
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
 *
 * The card is a panel that lifts, not an image with words underneath. Every
 * colour goes through `brand` or a `surface-*` role, so the same component is a
 * jewellery shop's card and a hardware shop's card without knowing which.
 *
 * Three things appear only when the data supports them — a second photograph to
 * cross-fade to, a rating, a low-stock line. A card that reserves room for all
 * three and then shows none is how a catalogue ends up looking unfinished.
 */
export function ProductCard({ product }: { product: Product }) {
  const store = useStore();

  const price = Number(product.price);
  const was = product.compareAtPrice ? Number(product.compareAtPrice) : null;
  const off = was && was > price ? Math.round(((was - price) / was) * 100) : null;

  const rating = Number(product.ratingAverage);
  const hasRating = product.ratingCount > 0 && rating > 0;
  const second = product.images[1] ?? null;
  const soldOut = product.stock <= 0;
  // Only worth saying when it is genuinely nearly gone; "9 left" is not urgency.
  const scarce = !soldOut && product.stock <= 5;

  return (
    <div className="group relative">
      {/*
        Outside the <Link>, deliberately.
        A button inside an anchor is invalid HTML and the browser resolves it by
        dropping one of them — which is how a wishlist heart ends up navigating
        to the product instead of saving it.
      */}
      <div className="absolute right-3 top-3 z-10 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
        {/* The shape comes from the variant; nothing is overridden here, which
            is what keeps the glyph centred. */}
        <SaveButton productId={product.id} variant="icon" />
      </div>

      <Link to={`/product/${product.slug}`} className="block">
        <div className="surface-card surface-raise overflow-hidden rounded-2xl border group-hover:-translate-y-1">
          <div className="relative aspect-[4/5] overflow-hidden bg-ink-50">
            {product.images[0] ? (
              <>
                <img
                  src={product.images[0].url}
                  alt={product.images[0].altText ?? product.name}
                  loading="lazy"
                  className={`h-full w-full object-cover transition-all duration-700 ease-out ${
                    second ? 'group-hover:opacity-0' : 'group-hover:scale-[1.06]'
                  }`}
                />
                {/* The second shot is usually the one that sells it — the back of
                    a garment, the thing in use. Layered over the first so the
                    swap cannot shift the grid. */}
                {second && (
                  <img
                    src={second.url}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700 ease-out group-hover:opacity-100"
                  />
                )}
              </>
            ) : (
              /*
                No photograph yet.

                Worth designing rather than leaving as grey with "No image" on
                it: a new shop has no pictures on its first day, and that first
                day is when the owner decides whether the thing looks like a
                real shop. A tinted panel in their own colour reads as a product
                awaiting a photo; a grey void reads as broken.
              */
              <div
                className="flex h-full items-center justify-center"
                style={{
                  backgroundImage:
                    'linear-gradient(135deg, rgb(var(--brand-primary) / 0.10), rgb(var(--brand-secondary) / 0.08))',
                }}
              >
                <ShoppingBag
                  size={30}
                  strokeWidth={1.25}
                  className="text-brand opacity-30"
                  aria-hidden="true"
                />
              </div>
            )}

            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />

            <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
              {off !== null && (
                // The store's own colour: a discount is a brand moment, and this
                // is the one badge on the card.
                <span className="rounded-full bg-brand px-2.5 py-1 text-[11px] font-semibold text-white shadow-glow-store-sm">
                  −{off}%
                </span>
              )}
              {soldOut && (
                <span className="rounded-full bg-ink-950/85 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                  Sold out
                </span>
              )}
            </div>

            <span className="pointer-events-none absolute inset-x-3 bottom-3 translate-y-3 rounded-full bg-white/95 py-2.5 text-center text-xs font-medium text-ink-950 opacity-0 shadow-raised backdrop-blur transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
              View product
            </span>
          </div>

          <div className="p-4">
            {product.category && (
              <p className="surface-muted text-[11px] uppercase tracking-[0.14em]">
                {product.category.name}
              </p>
            )}

            <h3 className="surface-strong mt-1.5 line-clamp-2 text-sm font-medium leading-snug transition-colors group-hover:text-brand">
              {product.name}
            </h3>

            {hasRating && (
              <p className="mt-2 flex items-center gap-1.5">
                <Stars value={rating} />
                <span className="numeric surface-muted text-[11px]">({product.ratingCount})</span>
              </p>
            )}

            <p className="mt-2.5 flex items-baseline gap-2 text-sm">
              <span className="numeric surface-strong font-semibold">
                {formatMoney(product.price, store.currency)}
              </span>
              {was && was > price && (
                <span className="numeric surface-muted text-xs line-through">
                  {formatMoney(product.compareAtPrice!, store.currency)}
                </span>
              )}
            </p>

            {scarce && (
              <p className="numeric mt-1.5 text-[11px] font-medium text-amber-700">
                Only {product.stock} left
              </p>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}

/**
 * A five-star row.
 *
 * Two overlaid rows clipped by width, rather than five individually rounded
 * icons: a 4.3 has to look like 4.3, and rounding each star to the nearest half
 * shows a different number from the one the product page states.
 */
function Stars({ value }: { value: number }) {
  const percent = Math.max(0, Math.min(100, (value / 5) * 100));

  return (
    <span
      className="relative inline-block leading-none"
      role="img"
      aria-label={`${value.toFixed(1)} out of 5`}
    >
      <span className="flex gap-0.5 text-ink-200">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} size={11} fill="currentColor" strokeWidth={0} />
        ))}
      </span>
      <span
        className="absolute inset-0 flex gap-0.5 overflow-hidden text-amber-500"
        style={{ width: `${percent}%` }}
        aria-hidden="true"
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} size={11} fill="currentColor" strokeWidth={0} className="shrink-0" />
        ))}
      </span>
    </span>
  );
}
