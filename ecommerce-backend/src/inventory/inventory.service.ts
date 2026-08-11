import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryReason, Prisma } from '@prisma/client';
import { PrismaService, ScopedTransactionClient } from '../common/prisma/prisma.service';
import { RequestContextStore } from '../common/context/request-context';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';
import { AdjustStockDto, InventoryQueryDto } from './dto/inventory.dto';

/** One line of a sale. Quantity is positive; the service applies the sign. */
export interface StockLine {
  productId: string;
  variantId?: string | null;
  quantity: number;
}

/**
 * Stock lives on Product/ProductVariant for read speed; InventoryTransaction is
 * the append-only ledger that explains how it got there. Both move together or
 * neither does.
 *
 * Concurrency is handled by making the decrement itself conditional — an
 * `updateMany` with `stock >= n` in the WHERE clause, which Postgres evaluates
 * under a row lock. Two checkouts racing for the last unit cannot both succeed:
 * the loser matches zero rows and is told the stock is gone. A read-then-write
 * would need a distributed lock to be safe; this does not, so an unreachable
 * Redis can slow the store down but cannot oversell it.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async history(query: InventoryQueryDto): Promise<PaginatedResult<unknown>> {
    const where: Prisma.InventoryTransactionWhereInput = {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.reason ? { reason: query.reason } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.inventoryTransaction.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true } },
          variant: { select: { id: true, name: true, sku: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.inventoryTransaction.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  /** Manual correction from the admin: stock counts, damage, supplier intake. */
  async adjust(dto: AdjustStockDto) {
    return this.prisma.db.$transaction((tx) =>
      this.applyDelta(tx, {
        productId: dto.productId,
        variantId: dto.variantId ?? null,
        delta: dto.quantityDelta,
        reason: dto.reason,
        reference: dto.reference ?? null,
        note: dto.note ?? null,
      }),
    );
  }

  /**
   * Moves every line in an existing transaction.
   *
   * Checkout must deduct stock, write the order and record the coupon as one
   * atomic unit, so it owns the transaction and passes it in here. Prisma has no
   * nested transactions, which is why this takes `tx` rather than opening one.
   */
  async applyLines(
    tx: ScopedTransactionClient,
    lines: StockLine[],
    reason: InventoryReason,
    reference: string,
    direction: 'deduct' | 'restock',
  ) {
    const results = [];
    for (const line of lines) {
      const magnitude = Math.abs(line.quantity);
      results.push(
        await this.applyDelta(tx, {
          productId: line.productId,
          variantId: line.variantId ?? null,
          delta: direction === 'deduct' ? -magnitude : magnitude,
          reason,
          reference,
          note: null,
        }),
      );
    }
    return results;
  }

  /** Standalone deduction for callers that have no transaction of their own. */
  async deductForSale(lines: StockLine[], reference: string) {
    return this.prisma.db.$transaction((tx) =>
      this.applyLines(tx, lines, InventoryReason.SALE, reference, 'deduct'),
    );
  }

  /** Mirror image of deductForSale, for cancellations and returns. */
  async restock(lines: StockLine[], reference: string, reason: InventoryReason) {
    return this.prisma.db.$transaction((tx) =>
      this.applyLines(tx, lines, reason, reference, 'restock'),
    );
  }

  // ---------------------------------------------------------------------------

  private async applyDelta(
    tx: ScopedTransactionClient,
    input: {
      productId: string;
      variantId: string | null;
      delta: number;
      reason: InventoryReason;
      reference: string | null;
      note: string | null;
    },
  ) {
    const { productId, variantId, delta } = input;

    // Scoped read: a product id from another tenant simply does not exist here.
    const product = await tx.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true, trackInventory: true },
    });
    if (!product) {
      throw new NotFoundException({
        message: 'That product does not exist.',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    if (variantId) {
      const variant = await tx.productVariant.findFirst({
        where: { id: variantId, productId },
        select: { id: true },
      });
      if (!variant) {
        throw new NotFoundException({
          message: 'That variant does not belong to this product.',
          code: 'VARIANT_NOT_FOUND',
        });
      }
    }

    // `stock: { gte: -delta }` is the whole concurrency story for a decrement.
    const guard = delta < 0 ? { stock: { gte: -delta } } : {};

    const changed = variantId
      ? await tx.productVariant.updateMany({
          where: { id: variantId, ...guard },
          data: { stock: { increment: delta } },
        })
      : await tx.product.updateMany({
          where: { id: productId, ...guard },
          data: { stock: { increment: delta } },
        });

    if (changed.count === 0) {
      throw new ConflictException({
        message: 'There is not enough stock left for that.',
        code: 'INSUFFICIENT_STOCK',
      });
    }

    const stockAfter = variantId
      ? (await tx.productVariant.findFirst({
          where: { id: variantId },
          select: { stock: true },
        }))!.stock
      : (await tx.product.findFirst({
          where: { id: productId },
          select: { stock: true },
        }))!.stock;

    const ledgerRow = await tx.inventoryTransaction.create({
      // tenantId is injected by the tenant-scope extension at runtime.
      data: {
        productId,
        variantId,
        reason: input.reason,
        quantityDelta: delta,
        stockAfter,
        reference: input.reference,
        note: input.note,
        createdById: RequestContextStore.get()?.userId ?? null,
      } as unknown as Prisma.InventoryTransactionCreateInput,
    });

    return { ...ledgerRow, trackInventory: product.trackInventory };
  }
}
