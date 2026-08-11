import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { money, Money, round2, ZERO } from '../common/money';

/**
 * Cancelled and refunded orders are excluded from revenue everywhere here.
 * Counting them would make the dashboard disagree with the store's own books,
 * and a number that flatters is worse than no number.
 */
const REVENUE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.PACKED,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

export interface DashboardSummary {
  range: { days: number; from: string; to: string };
  revenue: { total: string; previous: string; changePercent: number | null };
  orders: { count: number; previous: number; averageValue: string };
  customers: { total: number; newInRange: number };
  pending: { orders: number; reviews: number; lowStock: number };
  topProducts: { id: string; name: string; sku: string; unitsSold: number; revenue: string }[];
  dailyRevenue: { date: string; revenue: string; orders: number }[];
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(days = 30): Promise<DashboardSummary> {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    // The equivalent window immediately before, so "change" compares like periods.
    const previousFrom = new Date(from.getTime() - days * 86_400_000);

    // Days are grouped in the store's own timezone: a Mumbai shopkeeper's
    // "yesterday" ends at midnight IST, not at midnight UTC.
    const store = await this.prisma.db.store.findFirst({ select: { timezone: true } });
    const timeZone = store?.timezone ?? 'UTC';

    const inRange: Prisma.OrderWhereInput = {
      status: { in: REVENUE_STATUSES },
      placedAt: { gte: from, lte: to },
    };
    const inPrevious: Prisma.OrderWhereInput = {
      status: { in: REVENUE_STATUSES },
      placedAt: { gte: previousFrom, lt: from },
    };

    const [previous, customerTotal, newCustomers, pendingOrders, pendingReviews, lowStock, orders] =
      await Promise.all([
        this.prisma.db.order.aggregate({
          where: inPrevious,
          _sum: { grandTotal: true },
          _count: { id: true },
        }),
        this.prisma.db.customer.count(),
        this.prisma.db.customer.count({ where: { createdAt: { gte: from, lte: to } } }),
        this.prisma.db.order.count({ where: { status: OrderStatus.PENDING } }),
        this.prisma.db.review.count({ where: { status: ReviewStatus.PENDING } }),
        this.lowStockCount(),
        // Fetched once and used for both the headline figures and the daily
        // series. Aggregating separately gave two sources of truth for the same
        // orders, and they disagreed on the screen.
        this.prisma.db.order.findMany({
          where: inRange,
          select: { placedAt: true, grandTotal: true },
        }),
      ]);

    const dailyRevenue = groupByDay(orders, from, to, days, timeZone);

    // Derived from the same rows the chart draws, so the two cannot diverge.
    const revenue = round2(
      orders.reduce((total, o) => total.add(money(o.grandTotal)), ZERO),
    );
    const orderCount = orders.length;
    const previousRevenue = money(previous._sum.grandTotal ?? 0);

    return {
      range: { days, from: from.toISOString(), to: to.toISOString() },
      revenue: {
        total: revenue.toFixed(2),
        previous: previousRevenue.toFixed(2),
        changePercent: percentChange(previousRevenue, revenue),
      },
      orders: {
        count: orderCount,
        previous: previous._count.id,
        averageValue:
          orderCount > 0 ? round2(revenue.div(orderCount)).toFixed(2) : '0.00',
      },
      customers: { total: customerTotal, newInRange: newCustomers },
      pending: { orders: pendingOrders, reviews: pendingReviews, lowStock },
      topProducts: await this.topProducts(from, to),
      dailyRevenue,
    };
  }

  /**
   * Best sellers by units, over order line items rather than products, so a
   * renamed or archived product still shows what it actually sold.
   */
  private async topProducts(from: Date, to: Date) {
    const grouped = await this.prisma.db.orderItem.groupBy({
      by: ['productId'],
      where: {
        productId: { not: null },
        order: { status: { in: REVENUE_STATUSES }, placedAt: { gte: from, lte: to } },
      },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    });

    if (grouped.length === 0) return [];

    const products = await this.prisma.db.product.findMany({
      where: { id: { in: grouped.map((g) => g.productId!) } },
      select: { id: true, name: true, sku: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    return grouped.map((row) => ({
      id: row.productId!,
      name: byId.get(row.productId!)?.name ?? 'Deleted product',
      sku: byId.get(row.productId!)?.sku ?? '—',
      unitsSold: row._sum.quantity ?? 0,
      revenue: money(row._sum.lineTotal ?? 0).toFixed(2),
    }));
  }

  /** Products at or below their own threshold, which each product sets. */
  private async lowStockCount(): Promise<number> {
    const rows = await this.prisma.db.product.findMany({
      where: { deletedAt: null, trackInventory: true, status: 'ACTIVE' },
      select: { stock: true, lowStockThreshold: true },
    });
    return rows.filter((r) => r.stock <= r.lowStockThreshold).length;
  }
}

function percentChange(before: Money, after: Money): number | null {
  // Growth from zero is undefined, not infinite — the UI shows "no comparison".
  if (!before.greaterThan(0)) return null;
  return Number(after.sub(before).div(before).mul(100).toFixed(1));
}

/**
 * Every day the window touches appears, including the quiet ones — a sparse
 * series draws a chart that silently skips days with no orders.
 *
 * Keys are calendar dates in the store's timezone, produced by the same
 * function for both the empty buckets and the orders, so an order can never
 * hash to a date that has no bucket and vanish from the chart.
 */
function groupByDay(
  orders: { placedAt: Date; grandTotal: Prisma.Decimal }[],
  from: Date,
  to: Date,
  days: number,
  timeZone: string,
): { date: string; revenue: string; orders: number }[] {
  const dateKey = makeDateKey(timeZone);
  const buckets = new Map<string, { revenue: Money; orders: number }>();

  // Walks forward from `from` so the final bucket is today, inclusive.
  for (let i = 0; i <= days; i += 1) {
    const at = new Date(from.getTime() + i * 86_400_000);
    if (at.getTime() > to.getTime() + 86_400_000) break;
    buckets.set(dateKey(at), { revenue: ZERO, orders: 0 });
  }

  for (const order of orders) {
    const key = dateKey(order.placedAt);
    const bucket = buckets.get(key) ?? { revenue: ZERO, orders: 0 };
    bucket.revenue = bucket.revenue.add(money(order.grandTotal));
    bucket.orders += 1;
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({ date, revenue: b.revenue.toFixed(2), orders: b.orders }));
}

/** `en-CA` formats as YYYY-MM-DD, which sorts lexicographically. */
function makeDateKey(timeZone: string): (at: Date) => string {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    // An unrecognised timezone on the store row must not break the dashboard.
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }
  return (at: Date) => format.format(at);
}
