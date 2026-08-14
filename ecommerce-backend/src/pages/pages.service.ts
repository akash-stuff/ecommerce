import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';
import { sanitiseHtml } from './html-sanitiser';
import { CreatePageDto, PageQueryDto, UpdatePageDto } from './dto/page.dto';

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
    return { ...page, content: sanitiseHtml(page.content).html };
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
      data: { ...dto, slug, content: html } as unknown as Prisma.PageCreateInput,
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

    const data: Prisma.PageUncheckedUpdateInput = { ...dto };
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
