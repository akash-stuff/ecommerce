import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RequestContextStore } from '../common/context/request-context';
import { PERMISSIONS } from '../common/rbac/permissions';
import { paginate, PaginatedResult, safeOrderBy } from '../common/dto/pagination.dto';
import {
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto,
} from './dto/product.dto';

/**
 * Reference implementation for a tenant-scoped module. Note that no method
 * mentions tenantId: the Prisma extension supplies it. Every other feature
 * module follows this shape.
 */
/** What a shopper or admin may sort a product list by. */
const PRODUCT_SORT_FIELDS = ['createdAt', 'name', 'price', 'stock', 'updatedAt'] as const;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The list endpoint is public, so it serves two very different callers.
   *
   * Staff browsing the admin need drafts and archived products; a visitor must
   * see only what is on sale. Defaulting to "no status filter" gave anonymous
   * callers every unreleased product — name, price and all — because the
   * storefront happened to pass `status=ACTIVE` and nothing enforced it.
   * Anyone calling the API directly saw the lot.
   */
  async findAll(query: ProductQueryDto): Promise<PaginatedResult<unknown>> {
    const canSeeUnpublished =
      RequestContextStore.get()?.permissions?.includes(PERMISSIONS.PRODUCTS_READ) ?? false;

    // Asking for drafts without permission returns nothing, rather than
    // quietly substituting ACTIVE and answering a different question.
    if (!canSeeUnpublished && query.status && query.status !== ProductStatus.ACTIVE) {
      return paginate([], 0, query);
    }

    const status = canSeeUnpublished ? query.status : ProductStatus.ACTIVE;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.featured !== undefined ? { isFeatured: query.featured } : {}),
      ...(query.inStock ? { stock: { gt: 0 } } : {}),
      ...(query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            price: {
              ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
              ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { sku: { contains: query.search, mode: 'insensitive' as const } },
              { tags: { has: query.search.toLowerCase() } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.product.findMany({
        where,
        include: {
          images: { orderBy: { position: 'asc' }, take: 1 },
          category: { select: { id: true, name: true, slug: true } },
          _count: { select: { variants: true } },
        },
        orderBy: safeOrderBy(query.sortBy, PRODUCT_SORT_FIELDS, 'createdAt', query.sortOrder),
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.product.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  /**
   * Storefront lookup by slug. A slug from tenant B simply does not exist from
   * inside tenant A's context — the 404 is produced by the scope, not by an
   * explicit check that someone could forget to write.
   */
  async findBySlug(slug: string) {
    const product = await this.prisma.db.product.findFirst({
      where: { slug, status: ProductStatus.ACTIVE, deletedAt: null },
      include: {
        images: { orderBy: { position: 'asc' } },
        variants: { where: { isActive: true } },
        category: true,
        brand: true,
        reviews: {
          where: { status: 'APPROVED' },
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, rating: true, title: true, comment: true,
            isVerifiedPurchase: true, createdAt: true,
            customer: { select: { firstName: true } },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException({
        message: 'That product is no longer available.',
        code: 'PRODUCT_NOT_FOUND',
      });
    }
    return product;
  }

  async findOne(id: string) {
    const product = await this.prisma.db.product.findFirst({
      where: { id, deletedAt: null },
      include: { images: { orderBy: { position: 'asc' } }, variants: true, category: true },
    });
    if (!product) {
      throw new NotFoundException({
        message: 'That product is no longer available.',
        code: 'PRODUCT_NOT_FOUND',
      });
    }
    return product;
  }

  async create(dto: CreateProductDto) {
    const { imageUrls, variants, ...rest } = dto;
    /**
     * Stamped explicitly on the nested rows.
     *
     * The tenant-scope extension intercepts the *operation* — `product.create`
     * — so it fills in the product's own tenantId and knows nothing about rows
     * written through a relation. `ProductImage.tenantId` and
     * `ProductVariant.tenantId` are both required, so a nested create without
     * this fails with `Argument 'tenantId' is missing`.
     */
    const tenantId = RequestContextStore.requireTenantId();

    return this.prisma.db.product.create({
      // tenantId is injected by the tenant-scope extension at runtime, so the
      // literal is cast to satisfy Prisma's generated create input type.
      data: {
        ...rest,
        slug: dto.slug ?? slugify(dto.name),
        tags: dto.tags?.map((t) => t.toLowerCase()) ?? [],
        images: imageUrls?.length
          ? { create: imageUrls.map((url, position) => ({ url, position, tenantId })) }
          : undefined,
        variants: variants?.length
          ? { create: variants.map((v) => ({ ...v, tenantId })) }
          : undefined,
      } as unknown as Prisma.ProductCreateInput,
      include: { images: true, variants: true },
    });
  }

  /**
   * `imageUrls` replaces the product's images outright when present, and is left
   * alone when absent.
   *
   * Replace rather than merge because the array *is* the gallery, in order:
   * `images[0]` is the thumbnail the storefront and the admin list both show, so
   * a reorder or a removal has to be expressible. An absent field still means
   * "not editing images", which is what a partial update from another screen
   * sends.
   *
   * `variants` is deliberately still ignored here. There is no UI that edits
   * them, and inventing replace-semantics for rows that orders reference by id
   * would risk deleting a variant an order line points at.
   */
  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id); // 404s if it belongs to another tenant
    const { imageUrls, variants: _variants, ...rest } = dto;
    const tenantId = RequestContextStore.requireTenantId();

    return this.prisma.db.product.update({
      where: { id },
      data: {
        ...rest,
        ...(dto.tags ? { tags: dto.tags.map((t) => t.toLowerCase()) } : {}),
        ...(imageUrls
          ? {
              images: {
                // Ordered by array position, so the old rows have to go rather
                // than be updated in place — there is no stable key to match on
                // when a URL moves from position 2 to position 0.
                deleteMany: {},
                create: imageUrls.map((url, position) => ({ url, position, tenantId })),
              },
            }
          : {}),
      },
      include: { images: { orderBy: { position: 'asc' } }, variants: true },
    });
  }

  /** Soft delete: order history references products, so rows are kept. */
  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.db.product.update({
      where: { id },
      data: { deletedAt: new Date(), status: ProductStatus.ARCHIVED },
    });
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 200);
}
