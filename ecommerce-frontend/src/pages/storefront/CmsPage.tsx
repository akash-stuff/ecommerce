import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/services/api-client';
import { useStore } from '@/features/theme/ThemeProvider';
import { useEffect } from 'react';

interface CmsPageData {
  title: string;
  slug: string;
  content: string;
  /** Artwork behind the heading. Null on a page that is only words. */
  backgroundImageUrl: string | null;
  images: { url: string; caption?: string }[];
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
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="h-8 w-1/3 animate-pulse rounded bg-ink-100" />
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 w-full animate-pulse rounded bg-ink-100" />
          ))}
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
    <article className="pb-16">
      {data.backgroundImageUrl ? (
        /* The heading over its own artwork. A scrim rather than a flat overlay
           colour, because the title has to stay legible over a photograph
           whose brightness nobody here chose — and a store that uploads a pale
           picture should not have to discover that by reading white on white. */
        <header className="relative isolate overflow-hidden">
          <img
            src={data.backgroundImageUrl}
            alt=""
            className="absolute inset-0 -z-10 h-full w-full object-cover"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink-950/80 to-ink-950/40" />
          <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
            <h1 className="font-display text-3xl tracking-tight text-white sm:text-4xl">
              {data.title}
            </h1>
          </div>
        </header>
      ) : (
        <header className="mx-auto max-w-3xl px-4 pt-16 sm:px-6">
          <h1 className="font-display text-3xl tracking-tight text-ink-950">{data.title}</h1>
        </header>
      )}

      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div
          className="cms-content mt-8"
          dangerouslySetInnerHTML={{ __html: data.content }}
        />

        {images.length > 0 && (
          /* One column for a single picture, two from `sm` up for a set — a
             lone image stretched across a two-column grid reads as a mistake. */
          <div
            className={`mt-12 grid gap-4 ${images.length > 1 ? 'sm:grid-cols-2' : ''}`}
          >
            {images.map((image, index) => (
              <figure key={`${image.url}-${index}`}>
                <img
                  src={image.url}
                  // The caption is the picture's own description when there is
                  // one; without it the image is decorative to a screen reader
                  // rather than announced as an unlabelled graphic.
                  alt={image.caption ?? ''}
                  loading="lazy"
                  className="w-full rounded-card border border-ink-100 object-cover"
                />
                {image.caption && (
                  <figcaption className="surface-muted mt-2 text-xs leading-relaxed">
                    {image.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
