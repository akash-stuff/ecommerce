import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/services/api-client';
import { useStore } from '@/features/theme/ThemeProvider';
import { useEffect } from 'react';

interface CmsPageData {
  title: string;
  slug: string;
  content: string;
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

  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-3xl tracking-tight text-ink-950">{data.title}</h1>
      <div
        className="cms-content mt-8"
        dangerouslySetInnerHTML={{ __html: data.content }}
      />
    </article>
  );
}
