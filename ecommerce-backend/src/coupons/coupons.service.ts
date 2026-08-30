import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, ScopedTransactionClient } from '../common/prisma/prisma.service';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';
import { money, Money } from '../common/money';
import type { CouponInput } from '../orders/pricing';
import { CouponQueryDto, CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';

/** Why a coupon was refused. Returned rather than thrown for cart previews. */
export type CouponRejection =
  | 'COUPON_NOT_FOUND'
  | 'COUPON_INACTIVE'
  | 'COUPON_NOT_STARTED'
  | 'COUPON_EXPIRED'
  | 'COUPON_USAGE_LIMIT_REACHED'
  | 'COUPON_CUSTOMER_LIMIT_REACHED'
  | 'COUPON_MIN_ORDER_NOT_MET'
  | 'COUPON_NO_ELIGIBLE_ITEMS';

export type CouponCheck =
  | { ok: true; coupon: CouponInput }
  | { ok: false; reason: CouponRejection; message: string };

export interface CouponContext {
  /** Discountable goods total, before tax and shipping. */
  subtotal: Money;
  productIds: string[];
  categoryIds: (string | null)[];
  customerId: string | null;
}

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Admin CRUD ------------------------------------------------------------

  async findAll(query: CouponQueryDto): Promise<PaginatedResult<unknown>> {
    const where: Prisma.CouponWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search ? { code: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.coupon.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  async findOne(id: string) {
    const coupon = await this.prisma.db.coupon.findFirst({ where: { id } });
    if (!coupon) {
      throw new NotFoundException({
        message: 'That coupon does not exist.',
        code: 'COUPON_NOT_FOUND',
      });
    }
    return coupon;
  }

  async create(dto: CreateCouponDto) {
    const code = dto.code.trim().toUpperCase();

    const existing = await this.prisma.db.coupon.findFirst({
      where: { code },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        message: 'A coupon with this code already exists.',
        code: 'COUPON_CODE_TAKEN',
      });
    }

    return this.prisma.db.coupon.create({
      // tenantId is injected by the tenant-scope extension at runtime.
      data: { ...dto, code } as unknown as Prisma.CouponCreateInput,
    });
  }

  async update(id: string, dto: UpdateCouponDto) {
    await this.findOne(id);
    return this.prisma.db.coupon.update({
      where: { id },
      data: dto as Prisma.CouponUpdateInput,
    });
  }

  /**
   * Switches a coupon off, or back on.
   *
   * The everyday control, and the reversible one: a campaign that has ended is
   * switched off, not destroyed, because the orders it discounted are still
   * being looked at.
   */
  async setActive(id: string, isActive: boolean) {
    await this.findOne(id);
    return this.prisma.db.coupon.update({ where: { id }, data: { isActive } });
  }

  /**
   * Removes a coupon for good — but only one that has never been redeemed.
   *
   * A used coupon is part of the record of what somebody paid. Deleting one
   * would cascade its `CouponUsage` rows away, taking with them the per-customer
   * redemption counts that make "one per customer" mean anything, and null the
   * `couponId` on every order that used it. The orders would survive — they
   * snapshot `couponCode` as text, deliberately — but the trail of who redeemed
   * what would not, and it is not recoverable.
   *
   * So the check is on redemptions rather than on age or status: a typo created
   * five minutes ago is deleted without ceremony, and anything a customer has
   * actually used is refused with the alternative named. The caller is told
   * which case it is, so the console can offer the right button instead of
   * presenting a failure.
   */
  async remove(id: string): Promise<void> {
    const coupon = await this.findOne(id);

    /**
     * Counted from the usage table rather than read off `Coupon.usageCount`.
     *
     * The counter is maintained by the redemption path; the rows are the record.
     * If the two ever disagree, refusing the delete is the safe way to be wrong.
     */
    const redemptions = await this.prisma.db.couponUsage.count({
      where: { couponId: id },
    });

    if (redemptions > 0) {
      throw new ConflictException({
        message:
          `${coupon.code} has been used on ${redemptions} ` +
          `${redemptions === 1 ? 'order' : 'orders'} and cannot be deleted. ` +
          'Switch it off instead — the orders that used it keep their record.',
        code: 'COUPON_IN_USE',
      });
    }

    await this.prisma.db.coupon.delete({ where: { id } });
  }

  // --- Validation ------------------------------------------------------------

  /**
   * Every restriction in the schema, checked in the order a shopper would find
   * most useful: existence, then the window, then limits, then the basket.
   *
   * Returns a result instead of throwing because a cart preview needs to render
   * with the coupon silently dropped, while checkout needs to refuse outright —
   * two different behaviours from one set of rules.
   */
  async check(code: string, ctx: CouponContext): Promise<CouponCheck> {
    const normalized = code.trim().toUpperCase();

    const coupon = await this.prisma.db.coupon.findFirst({
      where: { code: normalized },
    });

    if (!coupon) {
      return this.reject('COUPON_NOT_FOUND', 'That coupon code is not recognised.');
    }
    if (!coupon.isActive) {
      return this.reject('COUPON_INACTIVE', 'That coupon is no longer available.');
    }

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) {
      return this.reject('COUPON_NOT_STARTED', 'That coupon is not active yet.');
    }
    if (coupon.expiresAt && coupon.expiresAt < now) {
      return this.reject('COUPON_EXPIRED', 'That coupon has expired.');
    }

    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      return this.reject(
        'COUPON_USAGE_LIMIT_REACHED',
        'That coupon has been fully redeemed.',
      );
    }

    if (coupon.perCustomerLimit !== null && ctx.customerId) {
      const used = await this.prisma.db.couponUsage.count({
        where: { couponId: coupon.id, customerId: ctx.customerId },
      });
      if (used >= coupon.perCustomerLimit) {
        return this.reject(
          'COUPON_CUSTOMER_LIMIT_REACHED',
          'You have already used that coupon.',
        );
      }
    }

    if (coupon.minOrderAmount && ctx.subtotal.lessThan(coupon.minOrderAmount)) {
      return this.reject(
        'COUPON_MIN_ORDER_NOT_MET',
        `Spend at least ${coupon.minOrderAmount.toFixed(2)} to use that coupon.`,
      );
    }

    // A scoped coupon on a basket it does not cover is a refusal, not a
    // zero discount — otherwise the shopper sees it "applied" and no change.
    const scoped = coupon.productIds.length > 0 || coupon.categoryIds.length > 0;
    if (scoped) {
      const covers =
        ctx.productIds.some((id) => coupon.productIds.includes(id)) ||
        ctx.categoryIds.some((id) => id !== null && coupon.categoryIds.includes(id));

      if (!covers) {
        return this.reject(
          'COUPON_NO_ELIGIBLE_ITEMS',
          'That coupon does not apply to anything in your cart.',
        );
      }
    }

    return {
      ok: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: money(coupon.discountValue),
        maxDiscountAmount: coupon.maxDiscountAmount ? money(coupon.maxDiscountAmount) : null,
        productIds: coupon.productIds,
        categoryIds: coupon.categoryIds,
      },
    };
  }

  /**
   * Called inside the checkout transaction. The conditional `updateMany` is the
   * same trick inventory uses: it makes the usage limit hold under concurrency
   * instead of two simultaneous checkouts both seeing the last redemption free.
   */
  async recordUsage(
    tx: ScopedTransactionClient,
    input: {
      couponId: string;
      orderId: string;
      customerId: string | null;
      amount: Money;
      usageLimit: number | null;
    },
  ): Promise<void> {
    const claimed = await tx.coupon.updateMany({
      where: {
        id: input.couponId,
        ...(input.usageLimit !== null ? { usageCount: { lt: input.usageLimit } } : {}),
      },
      data: { usageCount: { increment: 1 } },
    });

    if (claimed.count === 0) {
      throw new ConflictException({
        message: 'That coupon has just been fully redeemed.',
        code: 'COUPON_USAGE_LIMIT_REACHED',
      });
    }

    await tx.couponUsage.create({
      data: {
        couponId: input.couponId,
        orderId: input.orderId,
        customerId: input.customerId,
        amount: input.amount,
      } as unknown as Prisma.CouponUsageCreateInput,
    });
  }

  private reject(reason: CouponRejection, message: string): CouponCheck {
    return { ok: false, reason, message };
  }
}
