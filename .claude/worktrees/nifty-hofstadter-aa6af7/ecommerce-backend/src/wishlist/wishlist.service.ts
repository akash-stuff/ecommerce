import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RequestContextStore } from '../common/context/request-context';

/**
 * A customer's saved products.
 *
 * Requires a signed-in customer rather than falling back to the guest cart
 * token: a wishlist that vanishes when a browser clears its storage is worse
 * than one that asks for an account, and the schema keys it to a Customer row.
 */
@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const customerId = this.requireCustomer();

    const items = await this.prisma.db.wishlistItem.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            compareAtPrice: true,
            stock: true,
            status: true,
            images: { orderBy: { position: 'asc' }, take: 1, select: { url: true, altText: true } },
          },
        },
      },
    });

    // A product archived or deleted since it was saved is dropped from the view
    // rather than rendered as a dead link the shopper cannot act on.
    return items
      .filter((item) => item.product.status === ProductStatus.ACTIVE)
      .map((item) => ({
        id: item.id,
        savedAt: item.createdAt,
        product: {
          ...item.product,
          inStock: item.product.stock > 0,
        },
      }));
  }

  /**
   * Idempotent: saving the same product twice is what a double-click produces,
   * and it should leave one entry rather than fail.
   */
  async add(productId: string) {
    const customerId = this.requireCustomer();

    // ACTIVE, not merely undeleted: `list()` filters to active products, so
    // saving a draft would succeed and then never appear — the shopper would
    // see the heart fill and their wishlist stay empty.
    const product = await this.prisma.db.product.findFirst({
      where: { id: productId, deletedAt: null, status: ProductStatus.ACTIVE },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException({
        message: 'That product is no longer available.',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    const existing = await this.prisma.db.wishlistItem.findFirst({
      where: { customerId, productId },
      select: { id: true },
    });
    if (existing) return { id: existing.id, alreadySaved: true };

    const created = await this.prisma.db.wishlistItem.create({
      // tenantId is injected by the tenant-scope extension at runtime.
      data: { customerId, productId } as unknown as Prisma.WishlistItemCreateInput,
      select: { id: true },
    });

    return { id: created.id, alreadySaved: false };
  }

  /** Removal is by product id, which is what the storefront heart button knows. */
  async remove(productId: string): Promise<void> {
    const customerId = this.requireCustomer();

    await this.prisma.db.wishlistItem.deleteMany({ where: { customerId, productId } });
  }

  /** Lets a product page render the correct state without fetching the whole list. */
  async has(productId: string): Promise<{ saved: boolean }> {
    const customerId = RequestContextStore.get()?.customerId;
    if (!customerId) return { saved: false };

    const item = await this.prisma.db.wishlistItem.findFirst({
      where: { customerId, productId },
      select: { id: true },
    });

    return { saved: Boolean(item) };
  }

  private requireCustomer(): string {
    const customerId = RequestContextStore.get()?.customerId;
    if (!customerId) {
      throw new ForbiddenException({
        message: 'Sign in to save products.',
        code: 'NOT_A_CUSTOMER',
      });
    }
    return customerId;
  }
}
