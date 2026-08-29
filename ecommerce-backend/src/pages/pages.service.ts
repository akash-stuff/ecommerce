import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';
import { sanitiseHtml } from './html-sanitiser';
import {
  CreatePageDto,
  PageImageDto,
  PageQueryDto,
  UpdatePageDto,
} from './dto/page.dto';

/** Slugs the storefront router already owns; a page here would be unreachable. */
const RESERVED_SLUGS = new Set([
  'shop', 'search', 'cart', 'checkout', 'account', 'order', 'product',
  'category', 'wishlist', 'api', 'admin', 'platform', 'login',
]);

@Injectable()
export class PagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Storefront ------------------------------------------------------------

  /** Published pages only, for the footer nav. */
  listPublished() {
    return this.prisma.db.page.findMany({
      where: { isPublished: true },
      select: { slug: true, title: true },
      orderBy: { title: 'asc' },
    });
  }

  async findBySlug(slug: string) {
    const page = await this.prisma.db.page.findFirst({
      where: { slug, isPublished: true },
      select: {
        title: true,
        slug: true,
        content: true,
        backgroundImageUrl: true,
        images: true,
        metaTitle: true,
        metaDescription: true,
        updatedAt: true,
      },
    });

    if (!page) {
      throw new NotFoundException({
        message: 'That page does not exist.',
        code: 'PAGE_NOT_FOUND',
      });
    }

    /**
     * Sanitised again on the way out, even though it was sanitised on the way
     * in. The stored value should already be safe; re-checking means a row
     * written by an older build, a migration or a direct database edit cannot
     * reach a browser with a script in it.
     */
    return {
      ...page,
      content: sanitiseHtml(page.content).html,
      // Re-checked on the way out for the same reason the HTML is: a row
      // written by an older build or edited directly must not put a
      // `javascript:` URL into an <img src> on a published page.
      images: safeImages(page.images),
    };
  }

  // --- Admin -----------------------------------------------------------------

  async findAll(query: PageQueryDto): Promise<PaginatedResult<unknown>> {
    const where: Prisma.PageWhereInput = {
      ...(query.isPublished !== undefined ? { isPublished: query.isPublished } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.page.findMany({
        where,
        select: {
          id: true, title: true, slug: true, isPublished: true,
          createdAt: true, updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.page.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  async findOne(id: string) {
    const page = await this.prisma.db.page.findFirst({ where: { id } });
    if (!page) {
      throw new NotFoundException({
        message: 'That page does not exist.',
        code: 'PAGE_NOT_FOUND',
      });
    }
    return page;
  }

  async create(dto: CreatePageDto) {
    const slug = normaliseSlug(dto.slug ?? dto.title);
    await this.assertSlugUsable(slug);

    const { html, removed } = sanitiseHtml(dto.content);

    const page = await this.prisma.db.page.create({
      // tenantId is injected by the tenant-scope extension at runtime.
      data: {
        ...dto,
        slug,
        content: html,
        backgroundImageUrl: dto.backgroundImageUrl || null,
        // Stored as plain objects rather than the validated class instances, so
        // what lands in the Json column is exactly what comes back out.
        images: normaliseImages(dto.images) as Prisma.InputJsonValue,
      } as unknown as Prisma.PageCreateInput,
    });

    void this.audit.record({
      action: 'page.created',
      entityType: 'Page',
      entityId: page.id,
      changes: { slug, removed },
    });

    // `removed` is returned rather than logged: the author should be told their
    // markup changed and why, not discover it by reading the rendered page.
    return { ...page, removed };
  }

  async update(id: string, dto: UpdatePageDto) {
    await this.findOne(id);

    // `images` is pulled out of the spread rather than carried into it: the
    // column is Json and the DTO holds validated class instances, which is not
    // the same type. It is put back below, normalised.
    const { images: _images, ...scalars } = dto;
    const data: Prisma.PageUncheckedUpdateInput = { ...scalars };
    let removed: string[] = [];

    if (dto.slug !== undefined) {
      const slug = normaliseSlug(dto.slug);
      await this.assertSlugUsable(slug, id);
      data.slug = slug;
    }

    if (dto.content !== undefined) {
      const result = sanitiseHtml(dto.content);
      data.content = result.html;
      removed = result.removed;
    }

    // Empty clears the image; absent leaves it. Same three states as everywhere
    // else an image can be removed.
    if (dto.backgroundImageUrl !== undefined) {
      data.backgroundImageUrl = dto.backgroundImageUrl || null;
    }
    if (dto.images !== undefined) {
      data.images = normaliseImages(dto.images) as Prisma.InputJsonValue;
    }

    const page = await this.prisma.db.page.update({ where: { id }, data });

    void this.audit.record({
      action: 'page.updated',
      entityType: 'Page',
      entityId: id,
      changes: { fields: Object.keys(dto), removed },
    });

    return { ...page, removed };
  }

  async remove(id: string): Promise<void> {
    const page = await this.findOne(id);
    await this.prisma.db.page.delete({ where: { id } });

    void this.audit.record({
      action: 'page.deleted',
      entityType: 'Page',
      entityId: id,
      changes: { slug: page.slug, title: page.title },
    });
  }

  // ---------------------------------------------------------------------------

  private async assertSlugUsable(slug: string, exceptId?: string): Promise<void> {
    if (RESERVED_SLUGS.has(slug)) {
      throw new ConflictException({
        message: `"${slug}" is used by the storefront itself. Choose another address.`,
        code: 'PAGE_SLUG_RESERVED',
      });
    }

    const clash = await this.prisma.db.page.findFirst({
      where: { slug },
      select: { id: true },
    });

    if (clash && clash.id !== exceptId) {
      throw new ConflictException({
        message: 'A page already uses that address.',
        code: 'PAGE_SLUG_TAKEN',
      });
    }
  }
}

/**
 * The gallery, as plain rows with only http(s) URLs.
 *
 * An `<img src>` is not text content, so React's escaping does not protect it —
 * the same reasoning as `safeLink` in the banners service. Anything that is not
 * an absolute http(s) URL is dropped rather than refused: one bad row is not
 * worth failing a save of a page someone has just written.
 */
function normaliseImages(images?: PageImageDto[]): { url: string; caption?: string }[] {
  if (!images) return [];

  return images
    .filter((image) => typeof image?.url === 'string' && /^https?:\/\//i.test(image.url.trim()))
    .map((image) => ({
      url: image.url.trim(),
      ...(image.caption?.trim() ? { caption: image.caption.trim() } : {}),
    }));
}

/** The read-side counterpart, over a Json column of unknown shape. */
function safeImages(value: unknown): { url: string; caption?: string }[] {
  if (!Array.isArray(value)) return [];
  return normaliseImages(value as PageImageDto[]);
}

function normaliseSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}
