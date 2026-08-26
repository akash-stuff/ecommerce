import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductStatus } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../common/prisma/prisma.service';
import { escapeHtml } from '../notifications/templates';

export interface PageMeta {
  title: string;
  description: string;
  image: string | null;
  canonical: string;
  type: 'website' | 'product' | 'article';
  /** Only set for products; renders as an og:price tag. */
  price?: { amount: string; currency: string };
}

/**
 * Server-rendered `<head>` for the pages people share.
 *
 * The app is client-rendered, so `ThemeProvider` writes the real title and
 * description after the bundle boots. Googlebot executes JavaScript and sees
 * them; WhatsApp, Twitter, Slack and LinkedIn do not — they read the first
 * response and stop. That is why a shared product link previewed as a blank
 * card titled "Store".
 *
 * This injects the correct tags into the HTML shell before it is sent, for the
 * three routes that actually get shared. It is not full server rendering: the
 * body is still an empty `<div id="root">` and React hydrates it as before.
 * Meta is the part scrapers need, and it is the cheap part to serve.
 */
@Injectable()
export class SsrService {
  private readonly logger = new Logger(SsrService.name);
  private shell: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async renderStore(origin: string): Promise<string> {
    const store = await this.prisma.db.store.findFirst({
      where: { isPublished: true },
      select: {
        name: true, description: true, metaTitle: true, metaDescription: true,
        ogImage: true, theme: { select: { logoUrl: true } },
      },
    });

    if (!store) return this.render(null);

    return this.render({
      title: store.metaTitle || store.name,
      description: store.metaDescription ?? store.description ?? '',
      image: store.ogImage ?? store.theme?.logoUrl ?? null,
      canonical: `${origin}/`,
      type: 'website',
    });
  }

  async renderProduct(origin: string, slug: string): Promise<string> {
    const product = await this.prisma.db.product.findFirst({
      where: { slug, status: ProductStatus.ACTIVE, deletedAt: null },
      select: {
        name: true, shortDescription: true, description: true, price: true,
        metaTitle: true, metaDescription: true,
        images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
      },
    });

    const store = await this.storeIdentity();
    // A missing product still returns the shell: the SPA renders its own
    // "no longer available" page, and a 404 here would break that.
    if (!product) return this.render(null);

    return this.render({
      title: product.metaTitle || `${product.name} · ${store.name}`,
      description:
        product.metaDescription ??
        product.shortDescription ??
        truncate(product.description ?? '', 155) ??
        `${product.name} from ${store.name}.`,
      image: product.images[0]?.url ?? store.logo,
      canonical: `${origin}/product/${encodeURIComponent(slug)}`,
      type: 'product',
      price: { amount: product.price.toFixed(2), currency: store.currency },
    });
  }

  async renderCategory(origin: string, slug: string): Promise<string> {
    const category = await this.prisma.db.category.findFirst({
      where: { slug, isActive: true },
      select: { name: true, description: true, imageUrl: true, metaTitle: true, metaDescription: true },
    });

    const store = await this.storeIdentity();
    if (!category) return this.render(null);

    return this.render({
      title: category.metaTitle || `${category.name} · ${store.name}`,
      description: category.metaDescription ?? category.description ?? `${category.name} at ${store.name}.`,
      image: category.imageUrl ?? store.logo,
      canonical: `${origin}/category/${encodeURIComponent(slug)}`,
      type: 'website',
    });
  }

  // ---------------------------------------------------------------------------

  private async storeIdentity() {
    const store = await this.prisma.db.store.findFirst({
      select: { name: true, currency: true, theme: { select: { logoUrl: true } } },
    });

    return {
      name: store?.name ?? 'Store',
      currency: store?.currency ?? 'INR',
      logo: store?.theme?.logoUrl ?? null,
    };
  }

  /**
   * The built `index.html`, read once and kept.
   *
   * In development the file does not exist — Vite serves the shell — so this
   * falls back to a minimal document rather than failing. That means the meta
   * injection is only exercised against a production build, which is where it
   * runs.
   */
  private async loadShell(): Promise<string> {
    if (this.shell) return this.shell;

    const dist = this.config.get<string>(
      'frontend.distPath',
      join(process.cwd(), '..', 'ecommerce-frontend', 'dist'),
    );

    try {
      this.shell = await readFile(join(dist, 'index.html'), 'utf8');
    } catch {
      this.logger.warn(
        `No built frontend at ${dist}. Serving a bare shell; run the frontend build for production.`,
      );
      this.shell = '<!doctype html><html lang="en"><head></head><body><div id="root"></div></body></html>';
    }

    return this.shell;
  }

  private async render(meta: PageMeta | null): Promise<string> {
    const shell = await this.loadShell();
    if (!meta) return shell;

    const e = escapeHtml;
    const tags = [
      `<title>${e(meta.title)}</title>`,
      `<meta name="description" content="${e(meta.description)}">`,
      `<link rel="canonical" href="${e(meta.canonical)}">`,
      `<meta property="og:type" content="${meta.type}">`,
      `<meta property="og:title" content="${e(meta.title)}">`,
      `<meta property="og:description" content="${e(meta.description)}">`,
      `<meta property="og:url" content="${e(meta.canonical)}">`,
      meta.image ? `<meta property="og:image" content="${e(meta.image)}">` : '',
      // summary_large_image needs an image; without one the small card reads
      // better than a large card with a blank slot.
      `<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}">`,
      `<meta name="twitter:title" content="${e(meta.title)}">`,
      `<meta name="twitter:description" content="${e(meta.description)}">`,
      meta.image ? `<meta name="twitter:image" content="${e(meta.image)}">` : '',
      meta.price
        ? `<meta property="product:price:amount" content="${e(meta.price.amount)}">` +
          `<meta property="product:price:currency" content="${e(meta.price.currency)}">`
        : '',
    ]
      .filter(Boolean)
      .join('\n    ');

    // The shell's placeholder <title> is replaced rather than duplicated: two
    // title tags is invalid, and scrapers disagree about which one wins.
    return shell
      .replace(/<title>[\s\S]*?<\/title>/i, '')
      .replace('</head>', `    ${tags}\n  </head>`);
  }
}

function truncate(value: string, length: number): string | null {
  if (!value) return null;
  const text = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`;
}
