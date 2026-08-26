import { Injectable } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { money, round2 } from '../common/money';
import { ProductQueryDto } from './dto/product.dto';

export interface Facets {
  categories: { id: string; name: string; slug: string; count: number }[];
  brands: { id: string; name: string; count: number }[];
  price: { min: string; max: string };
  availability: { inStock: number; outOfStock: number };
  total: number;
}

/**
 * Counts for the filters a shopper has *not* yet applied.
 *
 * Every facet is computed against the same predicate as the result list minus
 * its own dimension: choosing a category should narrow the price range and the
 * brand counts, but must not reduce the category list to the one already
 * chosen — that would leave no way back without clearing the filter.
 *
 * Written with Prisma's `groupBy` rather than raw SQL. A hand-written query
 * would be faster in one round trip, but it would also be the only place in
 * this codebase where a tenant id is interpolated by hand rather than injected
 * by the scope extension, and that is not a trade worth making for a sidebar.
 */
@Injectable()
export class FacetsService {
  constructor(private readonly prisma: PrismaService) {}

  async compute(query: ProductQueryDto): Promise<Facets> {
    // Facets describe what a shopper can buy, so they never count drafts.
    const base: Prisma.ProductWhereInput = {
      deletedAt: null,
      status: ProductStatus.ACTIVE,
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

    const withCategory = query.categoryId ? { categoryId: query.categoryId } : {};
    const withBrand = query.brandId ? { brandId: query.brandId } : {};
    const withPrice =
      query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            price: {
              ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
              ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
            },
          }
        : {};

    const [categoryGroups, brandGroups, priceBounds, inStock, total] = await Promise.all([
      // Category counts ignore the chosen category, for the reason above.
      this.prisma.db.product.groupBy({
        by: ['categoryId'],
        where: { ...base, ...withBrand, ...withPrice, categoryId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.db.product.groupBy({
        by: ['brandId'],
        where: { ...base, ...withCategory, ...withPrice, brandId: { not: null } },
        _count: { _all: true },
      }),
      // Price bounds ignore the chosen price range, so a slider can be widened.
      this.prisma.db.product.aggregate({
        where: { ...base, ...withCategory, ...withBrand },
        _min: { price: true },
        _max: { price: true },
      }),
      this.prisma.db.product.count({
        where: { ...base, ...withCategory, ...withBrand, ...withPrice, stock: { gt: 0 } },
      }),
      this.prisma.db.product.count({
        where: { ...base, ...withCategory, ...withBrand, ...withPrice },
      }),
    ]);

    const [categories, brands] = await Promise.all([
      this.nameCategories(categoryGroups),
      this.nameBrands(brandGroups),
    ]);

    return {
      categories,
      brands,
      price: {
        min: round2(money(priceBounds._min.price ?? 0)).toFixed(2),
        max: round2(money(priceBounds._max.price ?? 0)).toFixed(2),
      },
      availability: { inStock, outOfStock: total - inStock },
      total,
    };
  }

  private async nameCategories(
    groups: { categoryId: string | null; _count: { _all: number } }[],
  ) {
    const ids = groups.map((g) => g.categoryId).filter((id): id is string => id !== null);
    if (ids.length === 0) return [];

    const rows = await this.prisma.db.category.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, name: true, slug: true },
    });
    const counts = new Map(groups.map((g) => [g.categoryId, g._count._all]));

    return rows
      .map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  private async nameBrands(groups: { brandId: string | null; _count: { _all: number } }[]) {
    const ids = groups.map((g) => g.brandId).filter((id): id is string => id !== null);
    if (ids.length === 0) return [];

    const rows = await this.prisma.db.brand.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const counts = new Map(groups.map((g) => [g.brandId, g._count._all]));

    return rows
      .map((b) => ({ ...b, count: counts.get(b.id) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
}
