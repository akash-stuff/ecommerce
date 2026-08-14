import { Injectable } from '@nestjs/common';
import { OrderStatus, TenantStatus } from '@prisma/client';
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
