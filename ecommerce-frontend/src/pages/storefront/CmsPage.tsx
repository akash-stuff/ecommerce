import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/services/api-client';
import { useStore } from '@/features/theme/ThemeProvider';
import { Reveal } from '@/features/storefront/Reveal';
import { useEffect } from 'react';

/** One gallery image: a URL and, optionally, what the store said about it. */
interface PageImage {
  url: string;
  caption?: string;
}

interface CmsPageData {
  title: string;
  slug: string;
  content: string;
  /** Artwork behind the heading. Null on a page that is only words. */
  backgroundImageUrl: string | null;
  images: PageImage[];
  metaTitle: string | null;
  metaDescription: string | null;
  updatedAt: string;
}

/**
 * A tenant-authored page: About, Contact, Terms.
 *
 * The content is the one place in this app where `dangerouslySetInnerHTML` is
 * used, and it is deliberate: the point of a CMS page is to render the author's
 * markup. What makes it safe is that the server sanitises against an allowlist
 * on write *and* again on read, so what arrives here has already been stripped
 * of scripts, event handlers and unsafe URLs. Escaping it instead would print
 * tags as text and defeat the feature.
 *
 * ## How the page is composed
 *
 * The store gives us a title, one block of HTML, an optional piece of artwork
 * and a set of images. That is not a section builder, so the rhythm has to come
 * from the shell rather than from the author: a hero that establishes the page,
 * prose held to a readable measure, and the images placed as deliberate
 * editorial bands rather than tipped into a grid at the end. The alternative —
 * asking every shopkeeper to hand-write layout markup in a textarea — produces
 * a different-looking page on every store, which is the opposite of a theme.
 */
export default function CmsPage() {
  const { slug } = useParams<{ slug: string }>();
  const store = useStore();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cms-page', slug],
    queryFn: () => unwrap<CmsPageData>(apiClient.get(`/pages/by-slug/${slug}`)),
    enabled: Boolean(slug),
  });

  useEffect(() => {
    if (!data) return;
    document.title = data.metaTitle || `${data.title} · ${store.name}`;

    let tag = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.name = 'description';
      document.head.appendChild(tag);
    }
    tag.content = data.metaDescription ?? '';
  }, [data, store.name]);

  if (isLoading) {
    return (
      <div className="mx-auto page-container px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-[46rem]">
          <div className="h-10 w-2/5 animate-pulse rounded bg-ink-100" />
          <div className="mt-8 space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-4 animate-pulse rounded bg-ink-100"
                // Ragged, not five identical bars: a skeleton that looks like
                // prose reads as loading, and one that looks like a table reads
                // as broken.
                style={{ width: `${[100, 96, 99, 88, 62][i]}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-xl text-ink-950">Page not found</h1>
        <p className="mt-2 text-sm text-ink-500">
          That address does not match a page on this store.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm font-medium text-brand">
          Back to the shop
        </Link>
      </div>
    );
  }

  const images = data.images ?? [];

  return (
    <article className="pb-24">
      <PageHero title={data.title} storeName={store.name} artwork={data.backgroundImageUrl} />

      {/*
        A measure, not the full container.

        `page-container` is up to 1320px, and prose set that wide is genuinely
        hard to read — the eye loses the line it is on coming back from the
        right edge. 46rem holds roughly 75 characters, which is the width the
        rest of the storefront's body copy already sits at.
      */}
      <div className="mx-auto page-container px-4 sm:px-6">
        <Reveal className="mx-auto mt-12 max-w-[46rem] sm:mt-16">
          <div className="cms-content" dangerouslySetInnerHTML={{ __html: data.content }} />
        </Reveal>
      </div>

      {images.length > 0 && (
        /*
          Alternating rows, not a grid.

          A staggered two-up grid was the obvious thing and it read as an
          accident — two columns of unequal length with 12px grey captions
          hanging off the bottom, which looks like a contact sheet someone
          forgot to finish rather than a composed page.

          A row per picture, side swapping down the page, is what the reference
          storefronts do. It costs vertical space and buys two things: the
          caption becomes a piece of typography instead of a footnote, and the
          rhythm is deliberate enough that three photographs look chosen.
        */
        <section className="mt-20 space-y-20 sm:mt-28 sm:space-y-28">
          {images.map((image, i) => (
            <GalleryRow key={`${image.url}-${i}`} image={image} index={i} />
          ))}
        </section>
      )}
    </article>
  );
}

/**
 * One picture and what the store said about it.
 *
 * The caption is set as a statement — display face, 20px, dark — rather than as
 * the 12px grey line it was. A caption on an about page is almost always one
 * sentence the shopkeeper chose to write about a photograph they chose to
 * upload, and setting it at footnote size tells the reader not to bother.
 *
 * Without a caption there is no text column to fill, so the picture takes the
 * width instead of sitting beside an empty half. A row that is 40% blank looks
 * like a loading state.
 */
function GalleryRow({ image, index }: { image: PageImage; index: number }) {
  if (!image.caption) {
    return (
      <Reveal className="mx-auto page-container px-4 sm:px-6">
        <Frame image={image} className="aspect-[16/9] sm:aspect-[21/9]" priority={index === 0} />
      </Reveal>
    );
  }

  // Left on even rows, right on odd. `lg:` only — stacked on a phone the swap
  // would just change which of image and caption came first, for no reason.
  const flipped = index % 2 === 1;

  return (
    <Reveal className="mx-auto page-container px-4 sm:px-6">
      {/* The row is the `figure`, so the caption it contains is actually
          associated with the picture. Wrapping only the image and leaving the
          `figcaption` as a sibling is invalid, and a screen reader then reads
          the caption as loose text belonging to nothing. */}
      <figure className="grid items-center gap-7 lg:grid-cols-12 lg:gap-14">
        <div className={`lg:col-span-7 ${flipped ? 'lg:col-start-6' : 'lg:col-start-1'}`}>
          <Frame image={image} className="aspect-[3/2]" priority={index === 0} />
        </div>

        {/*
          `lg:row-start-1` is what puts the caption beside the picture rather
          than under it when it comes second in the source. The source order is
          image-then-caption on purpose: that is the order they should be read
          in, and on a phone it is the order they appear in.
        */}
        <figcaption
          className={`lg:row-start-1 lg:col-span-4 ${
            flipped ? 'lg:col-start-1' : 'lg:col-start-9'
          }`}
        >
          <span className="block text-xs font-medium tabular-nums tracking-[0.2em] text-brand">
            {String(index + 1).padStart(2, '0')}
          </span>
          {/* A short rule rather than a border on the block: the caption is a
              few words on a wide page, and a full-height edge alongside it
              reads as a quote. */}
          <span className="mt-4 block h-px w-10 bg-brand/40" />
          <p className="surface-strong mt-5 font-display text-xl leading-snug tracking-tight">
            {image.caption}
          </p>
        </figcaption>
      </figure>
    </Reveal>
  );
}

/**
 * The band at the top of the page.
 *
 * With artwork it is a photograph with the title over it; without, it is the
 * store's own colour rather than a bare heading on white. A page that opens
 * with nothing but 30px of text does not read as a designed page, and most
 * stores will never upload a header image for their refund policy.
 */
function PageHero({
  title,
  storeName,
  artwork,
}: {
  title: string;
  storeName: string;
  artwork: string | null;
}) {
  if (artwork) {
    return (
      <header className="relative isolate overflow-hidden">
        <img
          src={artwork}
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        />
        {/* A scrim rather than a flat overlay colour, because the title has to
            stay legible over a photograph whose brightness nobody here chose —
            and a store that uploads a pale picture should not have to discover
            that by reading white on white. */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink-950/85 via-ink-950/55 to-ink-950/30" />
        <div className="mx-auto page-container px-4 py-24 sm:px-6 sm:py-32">
          <Eyebrow className="text-white/70">{storeName}</Eyebrow>
          <h1 className="mt-3 max-w-3xl font-display text-4xl tracking-tight text-white sm:text-5xl">
            {title}
          </h1>
        </div>
      </header>
    );
  }

  return (
    <header className="relative isolate overflow-hidden border-b border-ink-100 bg-brand-wash">
      <div className="mx-auto page-container px-4 py-16 sm:px-6 sm:py-24">
        <Eyebrow className="text-brand">{storeName}</Eyebrow>
        <h1 className="surface-strong mt-3 max-w-3xl font-display text-4xl tracking-tight sm:text-5xl">
          {title}
        </h1>
      </div>
    </header>
  );
}

/** The small tracked-out line above a heading, as used across the storefront. */
function Eyebrow({ children, className = '' }: { children: string; className?: string }) {
  return (
    <p className={`text-xs font-medium uppercase tracking-[0.18em] ${className}`}>{children}</p>
  );
}

/**
 * The picture itself, cropped and framed.
 *
 * The slow scale on hover is the only motion here. It is on the image inside a
 * clipping box rather than on the box, so the corners stay put — a card that
 * grows on hover shifts the two beside it.
 */
function Frame({
  image,
  className,
  priority = false,
}: {
  image: PageImage;
  className: string;
  priority?: boolean;
}) {
  return (
    <div className={`group overflow-hidden rounded-card bg-ink-50 ${className}`}>
      <img
        src={image.url}
        // The caption is the picture's own description when there is one;
        // without it the image is decorative to a screen reader rather than
        // announced as an unlabelled graphic.
        alt={image.caption ?? ''}
        // The first image is usually above the fold on a short page, and
        // lazy-loading the thing the page is about delays the only paint that
        // matters.
        loading={priority ? 'eager' : 'lazy'}
        className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out motion-safe:group-hover:scale-[1.04]"
      />
    </div>
  );
}
