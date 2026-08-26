import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, ReviewStatus } from '@prisma/client';
import { PrismaService, ScopedTransactionClient } from '../common/prisma/prisma.service';
import { RequestContextStore } from '../common/context/request-context';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';
import { CreateReviewDto, ReviewQueryDto } from './dto/review.dto';

/** Orders that count as "they actually received it". */
const FULFILLED_STATUSES: OrderStatus[] = [OrderStatus.SHIPPED, OrderStatus.DELIVERED];

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public list for a product. Only approved reviews, and no customer email or
   * id — a review page should not become a way to enumerate a store's customers.
   */
  async findForProduct(productId: string, query: ReviewQueryDto) {
    const where: Prisma.ReviewWhereInput = {
      productId,
      status: ReviewStatus.APPROVED,
    };

    const [items, total, breakdown] = await Promise.all([
      this.prisma.db.review.findMany({
        where,
        select: {
          id: true,
          rating: true,
          title: true,
          comment: true,
          isVerifiedPurchase: true,
          createdAt: true,
          customer: { select: { firstName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.review.count({ where }),
      this.prisma.db.review.groupBy({
        by: ['rating'],
        where,
        _count: { rating: true },
      }),
    ]);

    // Five buckets, always present, so the UI can render a full histogram
    // rather than only the ratings that happen to exist.
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of breakdown) counts[row.rating] = row._count.rating;

    return { ...paginate(items, total, query), breakdown: counts };
  }

  /**
   * Writing a review.
   *
   * Verified-purchase is decided here from the customer's order history, never
   * claimed by the client. A review that is not tied to a delivered order is
   * still allowed — plenty of stores want those — but it is labelled honestly.
   */
  async create(dto: CreateReviewDto) {
    const customerId = this.requireCustomer();

    const product = await this.prisma.db.product.findFirst({
      where: { id: dto.productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException({
        message: 'That product is no longer available.',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    const purchase = await this.prisma.db.order.findFirst({
      where: {
        customerId,
        status: { in: FULFILLED_STATUSES },
        items: { some: { productId: dto.productId } },
      },
      select: { id: true },
      orderBy: { placedAt: 'desc' },
    });

    const existing = await this.prisma.db.review.findFirst({
      where: { productId: dto.productId, customerId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        message: 'You have already reviewed this product.',
        code: 'REVIEW_ALREADY_EXISTS',
      });
    }

    const review = await this.prisma.db.review.create({
      // tenantId is injected by the tenant-scope extension at runtime.
      data: {
        productId: dto.productId,
        customerId,
        orderId: purchase?.id ?? null,
        rating: dto.rating,
        title: dto.title ?? null,
        comment: dto.comment ?? null,
        isVerifiedPurchase: Boolean(purchase),
        // Held for moderation: an unmoderated review box is a spam target.
        status: ReviewStatus.PENDING,
      } as unknown as Prisma.ReviewCreateInput,
    });

    return review;
  }

  /** The signed-in customer's own reviews, whatever their status. */
  async findMine(query: ReviewQueryDto): Promise<PaginatedResult<unknown>> {
    const customerId = this.requireCustomer();

    const where: Prisma.ReviewWhereInput = { customerId };
    const [items, total] = await Promise.all([
      this.prisma.db.review.findMany({
        where,
        include: { product: { select: { name: true, slug: true } } },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.review.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  // --- Moderation ------------------------------------------------------------

  async findAll(query: ReviewQueryDto): Promise<PaginatedResult<unknown>> {
    const where: Prisma.ReviewWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.review.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true } },
          customer: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.review.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  /**
   * Approving or rejecting changes what the public sees, so the product's
   * cached rating is recomputed in the same transaction. Leaving it stale would
   * show a five-star average on a product whose only review was just rejected.
   */
  async moderate(id: string, status: ReviewStatus) {
    return this.prisma.db.$transaction(async (tx) => {
      const review = await tx.review.findFirst({
        where: { id },
        select: { id: true, productId: true },
      });
      if (!review) {
        throw new NotFoundException({
          message: 'That review does not exist.',
          code: 'REVIEW_NOT_FOUND',
        });
      }

      const updated = await tx.review.update({ where: { id }, data: { status } });
      await this.recalculateRating(tx, review.productId);
      return updated;
    });
  }

  /** Averages only approved reviews — the same set the storefront displays. */
  private async recalculateRating(tx: ScopedTransactionClient, productId: string) {
    const stats = await tx.review.aggregate({
      where: { productId, status: ReviewStatus.APPROVED },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await tx.product.updateMany({
      where: { id: productId },
      data: {
        ratingAverage: stats._avg.rating ?? 0,
        ratingCount: stats._count.rating,
      },
    });
  }

  private requireCustomer(): string {
    const customerId = RequestContextStore.get()?.customerId;
    if (!customerId) {
      throw new ForbiddenException({
        message: 'Sign in to leave a review.',
        code: 'NOT_A_CUSTOMER',
      });
    }
    return customerId;
  }
}
