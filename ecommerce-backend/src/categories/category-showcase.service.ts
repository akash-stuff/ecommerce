import { Injectable } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * One tile in the storefront's "shop by category" row.
 *
 * `discount` is the real spread across the category's live products, computed
 * from `compareAtPrice` against `price` — the same arithmetic the product card
 * does for its badge, so a tile promising "30–70% off" is promising something a
 * shopper will actually find inside it. It is null when nothing in the category
 * is reduced, and the tile shows the product count instead.
 *
 * The alternative was a copy field the shopkeeper types, which is how storefronts
 * end up advertising last season's sale in perpetuity.
 */
export interface CategoryTile {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  productCount: number;
  discount: { min: number; max: number } | null;
}

@Injectable()
export class CategoryShowcaseService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Top-level categories with something to show, richest first.
   *
   * Only categories that actually have live products: a tile leading to an
   * empty grid is a dead end, and a row of them is what makes a new shop look
   * abandoned rather than new.
   *
   * Products are counted against the category they are filed under directly.
   * Rolling descendants up would double-count a product filed on both a parent
   * and a child, and this row shows top-level categories, which in practice is
   * where a small shop files things.
   */
  async tiles(limit = 8): Promise<CategoryTile[]> {
    const categories = await this.prisma.db.category.findMany({
      where: { isActive: true, parentId: null },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true, imageUrl: true },
    });

    if (categories.length === 0) return [];

    /**
     * One query for every product in those categories rather than one per
     * category. A shop with twenty categories would otherwise open its homepage
     * with twenty round trips, and the rows are small — an id, two decimals.
     */
    const products = await this.prisma.db.product.findMany({
      where: {
        status: ProductStatus.ACTIVE,
        categoryId: { in: categories.map((c) => c.id) },
      },
      select: { categoryId: true, price: true, compareAtPrice: true },
    });

    const byCategory = new Map<string, { count: number; discounts: number[] }>();
    for (const product of products) {
      if (!product.categoryId) continue;
      const bucket = byCategory.get(product.categoryId) ?? { count: 0, discounts: [] };
      bucket.count += 1;

      const price = Number(product.price);
      const was = product.compareAtPrice === null ? null : Number(product.compareAtPrice);
      // Guarded against a zero or absent `compareAtPrice`: dividing by it would
      // give Infinity, and a tile reading "Infinity% off" is memorable for the
      // wrong reason.
      if (was !== null && was > price && was > 0) {
        bucket.discounts.push(Math.round(((was - price) / was) * 100));
      }
      byCategory.set(product.categoryId, bucket);
    }

    return categories
      .map((category) => {
        const bucket = byCategory.get(category.id);
        const discounts = bucket?.discounts ?? [];

        return {
          ...category,
          productCount: bucket?.count ?? 0,
          discount:
            discounts.length > 0
              ? { min: Math.min(...discounts), max: Math.max(...discounts) }
              : null,
        };
      })
      .filter((tile) => tile.productCount > 0)
      .slice(0, limit);
  }
}
