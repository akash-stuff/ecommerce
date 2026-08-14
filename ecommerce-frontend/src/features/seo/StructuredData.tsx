import { useEffect } from 'react';

/**
 * JSON-LD for a single page.
 *
 * Written with `textContent` into a `<script type="application/ld+json">`, which
 * is inert — the browser never executes it — and cleaned up when the page
 * changes so a product page cannot leave its schema behind on the next one.
 *
 * This is the one piece of SEO that works acceptably from a client-rendered app:
 * Google executes JavaScript before parsing structured data. Open Graph previews
 * on WhatsApp, Twitter and LinkedIn still will not, because those scrapers do
 * not run scripts — that needs server rendering. See docs/STATUS.md.
 */
export function StructuredData({ data }: { data: Record<string, unknown> | null }) {
  useEffect(() => {
    const id = 'structured-data';
    document.getElementById(id)?.remove();
    if (!data) return;

    const script = document.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);

    return () => document.getElementById(id)?.remove();
  }, [data]);

  return null;
}

export function productSchema(input: {
  name: string;
  description: string | null;
  sku: string;
  image: string | null;
  price: string;
  currency: string;
  inStock: boolean;
  storeName: string;
  ratingAverage: number;
  ratingCount: number;
  url: string;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    sku: input.sku,
    ...(input.image ? { image: [input.image] } : {}),
    brand: { '@type': 'Brand', name: input.storeName },
    offers: {
      '@type': 'Offer',
      url: input.url,
      priceCurrency: input.currency,
      price: input.price,
      availability: input.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
    // Only claimed when reviews exist. An aggregateRating of 0 from 0 reviews is
    // a structured-data error Google reports, not a neutral default.
    ...(input.ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: input.ratingAverage.toFixed(1),
            reviewCount: input.ratingCount,
          },
        }
      : {}),
  };
}

export function storeSchema(input: {
  name: string;
  description: string | null;
  url: string;
  logo: string | null;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    url: input.url,
    ...(input.logo ? { logo: input.logo } : {}),
  };
}

export function breadcrumbSchema(
  trail: { name: string; url: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
