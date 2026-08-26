import { Injectable } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

/** Sitemaps are capped at 50,000 URLs by the protocol. */
const MAX_URLS = 50_000;

@Injectable()
export class SeoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Only what a crawler should index: active products and visible categories.
   * A draft product in a sitemap is an invitation to index a page that returns
   * 404, which costs crawl budget and looks like a broken site.
   */
  async sitemap(origin: string): Promise<string> {
    const store = await this.prisma.db.store.findFirst({
      where: { isPublished: true },
      select: { updatedAt: true },
    });

    // An unpublished store gets a valid but empty sitemap rather than an error:
    // a 500 here would be retried forever by crawlers.
    if (!store) return wrap([]);

    const [products, categories, pages] = await Promise.all([
      this.prisma.db.product.findMany({
        where: { status: ProductStatus.ACTIVE, deletedAt: null },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: MAX_URLS - 100,
      }),
      this.prisma.db.category.findMany({
        where: { isActive: true },
        select: { slug: true, updatedAt: true },
      }),
      this.prisma.db.page.findMany({
        where: { isPublished: true },
        select: { slug: true, updatedAt: true },
      }),
    ]);

    const entries: SitemapEntry[] = [
      { loc: `${origin}/`, lastmod: store.updatedAt, priority: '1.0', changefreq: 'daily' },
      { loc: `${origin}/shop`, lastmod: store.updatedAt, priority: '0.9', changefreq: 'daily' },
      ...categories.map((c) => ({
        loc: `${origin}/category/${encodeURIComponent(c.slug)}`,
        lastmod: c.updatedAt,
        priority: '0.7',
        changefreq: 'weekly' as const,
      })),
      ...products.map((p) => ({
        loc: `${origin}/product/${encodeURIComponent(p.slug)}`,
        lastmod: p.updatedAt,
        priority: '0.8',
        changefreq: 'weekly' as const,
      })),
      // Tenant pages change rarely but are exactly the pages a search engine
      // uses to judge whether a store is a real business.
      ...pages.map((page) => ({
        loc: `${origin}/${encodeURIComponent(page.slug)}`,
        lastmod: page.updatedAt,
        priority: '0.5',
        changefreq: 'monthly' as const,
      })),
    ];

    return wrap(entries);
  }

  /**
   * Cart, checkout and account pages are disallowed: they are per-visitor, have
   * nothing to index, and a crawler walking them burns budget and can generate
   * spurious carts.
   */
  async robots(origin: string): Promise<string> {
    const store = await this.prisma.db.store.findFirst({
      where: { isPublished: true },
      select: { id: true },
    });

    // Nothing published yet — keep the whole site out of the index rather than
    // let a half-built store get crawled and cached.
    if (!store) {
      return ['User-agent: *', 'Disallow: /', ''].join('\n');
    }

    return [
      'User-agent: *',
      'Allow: /',
      'Disallow: /cart',
      'Disallow: /checkout',
      'Disallow: /account',
      'Disallow: /order/',
      'Disallow: /api/',
      '',
      `Sitemap: ${origin}/sitemap.xml`,
      '',
    ].join('\n');
  }
}

interface SitemapEntry {
  loc: string;
  lastmod: Date;
  priority: string;
  changefreq: 'daily' | 'weekly' | 'monthly';
}

function wrap(entries: SitemapEntry[]): string {
  const urls = entries
    .map(
      (e) =>
        `  <url>\n` +
        `    <loc>${escapeXml(e.loc)}</loc>\n` +
        `    <lastmod>${e.lastmod.toISOString().slice(0, 10)}</lastmod>\n` +
        `    <changefreq>${e.changefreq}</changefreq>\n` +
        `    <priority>${e.priority}</priority>\n` +
        `  </url>`,
    )
    .join('\n');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${urls}${urls ? '\n' : ''}` +
    `</urlset>\n`
  );
}

/**
 * A slug is already URL-encoded above, but a store name or a stray character in
 * the origin could still carry an ampersand — which makes the whole document
 * invalid XML rather than merely wrong.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
