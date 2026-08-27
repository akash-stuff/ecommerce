import { Injectable } from '@nestjs/common';
import { OrderStatus, ProductStatus, TenantStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { money, round2, ZERO } from '../common/money';

/** Same exclusions the tenant dashboard uses, so the two never disagree. */
const REVENUE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.PACKED,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

/**
 * The platform's own view: how many stores exist, how much they are collectively
 * selling, and which ones are worth paying attention to.
 *
 * Every query here is unscoped by design — this is the one place that reads
 * across tenants, which is why the controller is `@PlatformOnly`.
 */
@Injectable()
export class PlatformAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One store, in the same shape the platform overview reports the whole
   * platform in.
   *
   * Deliberately not `AnalyticsService.dashboard`: that one reads through the
   * tenant-scoped client and answers for *the caller's* tenant, which is the
   * right thing for a shopkeeper and useless for an operator comparing stores.
   * This runs unscoped with an explicit `tenantId`, which is only safe because
   * the route is `@PlatformOnly`.
   */
  async storeBreakdown(tenantId: string, days = 30) {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    // The window immediately before, so "change" compares like with like.
    const previousFrom = new Date(from.getTime() - days * 86_400_000);

    return this.prisma.runUnscoped(async (db) => {
      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          slug: true,
          businessName: true,
          status: true,
          createdAt: true,
          contactEmail: true,
          store: { select: { name: true, isPublished: true, currency: true } },
          subscription: { select: { plan: { select: { name: true } } } },
        },
      });

      if (!tenant) return null;

      const revenueWindow = { status: { in: REVENUE_STATUSES }, tenantId };

      const [orders, previousOrders, customers, products, live, topProducts, byStatus] =
        await Promise.all([
          db.order.findMany({
            where: { ...revenueWindow, placedAt: { gte: from, lte: to } },
            select: { grandTotal: true, placedAt: true },
          }),
          db.order.findMany({
            where: { ...revenueWindow, placedAt: { gte: previousFrom, lt: from } },
            select: { grandTotal: true },
          }),
          db.customer.count({ where: { tenantId } }),
          db.product.count({ where: { tenantId, deletedAt: null } }),
          db.product.count({
            where: { tenantId, deletedAt: null, status: ProductStatus.ACTIVE },
          }),
          db.orderItem.groupBy({
            by: ['productId'],
            where: { tenantId, order: { ...revenueWindow, placedAt: { gte: from, lte: to } } },
            _sum: { quantity: true, lineTotal: true },
            orderBy: { _sum: { lineTotal: 'desc' } },
            take: 5,
          }),
          db.order.groupBy({
            by: ['status'],
            where: { tenantId, placedAt: { gte: from, lte: to } },
            _count: { id: true },
          }),
        ]);

      const gross = round2(orders.reduce((t, o) => t.add(money(o.grandTotal)), ZERO));
      const previousGross = round2(
        previousOrders.reduce((t, o) => t.add(money(o.grandTotal)), ZERO),
      );

      /**
       * `OrderItem.productId` is nullable: a line snapshots what was bought, so
       * it outlives the product row and keeps reporting the sale. Those lines
       * are dropped from a "top products" list — they have no product to be top
       * of — but their revenue is still counted in `gross` above, which is what
       * makes the totals add up.
       */
      const soldIds = topProducts
        .map((r) => r.productId)
        .filter((id): id is string => id !== null);

      // Names in one query rather than one per row.
      const productNames = await db.product.findMany({
        where: { id: { in: soldIds } },
        select: { id: true, name: true, sku: true },
      });
      const byProductId = new Map(productNames.map((p) => [p.id, p]));

      return {
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          businessName: tenant.businessName,
          storeName: tenant.store?.name ?? tenant.businessName,
          status: tenant.status,
          isPublished: tenant.store?.isPublished ?? false,
          currency: tenant.store?.currency ?? 'INR',
          contactEmail: tenant.contactEmail,
          plan: tenant.subscription?.plan?.name ?? null,
          createdAt: tenant.createdAt.toISOString(),
        },
        range: { days, from: from.toISOString(), to: to.toISOString() },
        revenue: {
          total: gross.toFixed(2),
          previous: previousGross.toFixed(2),
          // Null rather than 0% when there is nothing to compare against — a
          // store's first month is not "no change".
          changePercent: previousGross.isZero()
            ? null
            : Number(
                gross.minus(previousGross).dividedBy(previousGross).times(100).toFixed(1),
              ),
        },
        orders: {
          count: orders.length,
          previous: previousOrders.length,
          averageValue: orders.length
            ? gross.dividedBy(orders.length).toFixed(2)
            : '0.00',
          byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count.id])),
        },
        catalogue: { products, live, customers },
        topProducts: topProducts
          .filter((r): r is typeof r & { productId: string } => r.productId !== null)
          .map((r) => ({
            id: r.productId,
            name: byProductId.get(r.productId)?.name ?? 'Deleted product',
            sku: byProductId.get(r.productId)?.sku ?? '',
            unitsSold: r._sum.quantity ?? 0,
            revenue: money(r._sum.lineTotal ?? 0).toFixed(2),
          })),
      };
    });
  }

  async overview(days = 30) {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);

    return this.prisma.runUnscoped(async (db) => {
      const [byStatus, newTenants, orders, customers, products, topTenants] =
        await Promise.all([
          db.tenant.groupBy({ by: ['status'], _count: { id: true } }),
          db.tenant.count({ where: { createdAt: { gte: from } } }),
          db.order.findMany({
            where: { status: { in: REVENUE_STATUSES }, placedAt: { gte: from, lte: to } },
            select: { grandTotal: true, tenantId: true },
          }),
          db.customer.count(),
          db.product.count({ where: { deletedAt: null } }),
          db.order.groupBy({
            by: ['tenantId'],
            where: { status: { in: REVENUE_STATUSES }, placedAt: { gte: from, lte: to } },
            _sum: { grandTotal: true },
            _count: { id: true },
            orderBy: { _sum: { grandTotal: 'desc' } },
            take: 5,
          }),
        ]);

      const counts = Object.fromEntries(byStatus.map((r) => [r.status, r._count.id]));
      const gross = round2(orders.reduce((total, o) => total.add(money(o.grandTotal)), ZERO));

      // Names resolved in one query rather than one per row.
      const names = await db.tenant.findMany({
        where: { id: { in: topTenants.map((t) => t.tenantId) } },
        select: { id: true, slug: true, businessName: true },
      });
      const byId = new Map(names.map((t) => [t.id, t]));

      return {
        range: { days, from: from.toISOString(), to: to.toISOString() },
        tenants: {
          total: byStatus.reduce((sum, r) => sum + r._count.id, 0),
          active: counts[TenantStatus.ACTIVE] ?? 0,
          suspended: counts[TenantStatus.SUSPENDED] ?? 0,
          // Provisioned but not yet live — no TRIAL state exists in the schema.
          pending: counts[TenantStatus.PENDING] ?? 0,
          cancelled: counts[TenantStatus.CANCELLED] ?? 0,
          newInRange: newTenants,
        },
        catalogue: { products, customers },
        // Gross merchandise value — what the stores sold, not what the platform
        // earned. Naming it plainly avoids anyone reading it as revenue.
        grossMerchandiseValue: gross.toFixed(2),
        orders: orders.length,
        topTenants: topTenants.map((t) => ({
          id: t.tenantId,
          slug: byId.get(t.tenantId)?.slug ?? 'unknown',
          businessName: byId.get(t.tenantId)?.businessName ?? 'Deleted store',
          orders: t._count.id,
          revenue: money(t._sum.grandTotal ?? 0).toFixed(2),
        })),
      };
    });
  }
}
