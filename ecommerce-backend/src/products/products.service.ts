import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';
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
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ProductQueryDto): Promise<PaginatedResult<unknown>> {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
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
        orderBy: { [query.sortBy]: query.sortOrder },
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

    return this.prisma.db.product.create({
      // tenantId is injected by the tenant-scope extension at runtime, so the
      // literal is cast to satisfy Prisma's generated create input type.
      data: {
        ...rest,
        slug: dto.slug ?? slugify(dto.name),
        tags: dto.tags?.map((t) => t.toLowerCase()) ?? [],
        images: imageUrls?.length
          ? { create: imageUrls.map((url, position) => ({ url, position })) }
          : undefined,
        variants: variants?.length ? { create: variants } : undefined,
      } as unknown as Prisma.ProductCreateInput,
      include: { images: true, variants: true },
    });
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id); // 404s if it belongs to another tenant
    const { imageUrls, variants, ...rest } = dto;

    return this.prisma.db.product.update({
      where: { id },
      data: {
        ...rest,
        ...(dto.tags ? { tags: dto.tags.map((t) => t.toLowerCase()) } : {}),
      },
      include: { images: true, variants: true },
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
