import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';
import { money, round2, ZERO } from '../common/money';
import { CustomerQueryDto, UpdateCustomerDto } from './dto/customer.dto';

/** Cancelled and refunded orders do not count towards what someone has spent. */
const SPEND_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.PACKED,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: CustomerQueryDto): Promise<PaginatedResult<unknown>> {
    const where: Prisma.CustomerWhereInput = {
      ...(query.hasOrdered ? { orders: { some: {} } } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' as const } },
              { firstName: { contains: query.search, mode: 'insensitive' as const } },
              { lastName: { contains: query.search, mode: 'insensitive' as const } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.db.customer.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          isActive: true,
          createdAt: true,
          lastOrderAt: true,
          _count: { select: { orders: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.customer.count({ where }),
    ]);

    // Spend and last-order are derived from orders rather than read from the
    // Customer columns. Those are only as current as whatever last wrote them —
    // and nothing does, so the row showed "1 order, last ordered never".
    const stats = await this.statsByCustomer(rows.map((r) => r.id));

    const items = rows.map((row) => {
      const stat = stats.get(row.id);
      return {
        ...row,
        orderCount: row._count.orders,
        totalSpent: (stat?.spent ?? ZERO).toFixed(2),
        lastOrderAt: stat?.lastOrderAt ?? null,
      };
    });

    return paginate(items, total, query);
  }

  async findOne(id: string) {
    const customer = await this.prisma.db.customer.findFirst({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        isActive: true,
        acceptsMarketing: true,
        emailVerifiedAt: true,
        createdAt: true,
        lastOrderAt: true,
        addresses: {
          select: {
            id: true, label: true, fullName: true, phone: true,
            line1: true, line2: true, city: true, state: true,
            postalCode: true, country: true, isDefault: true,
          },
          orderBy: { isDefault: 'desc' },
        },
        orders: {
          select: {
            id: true, orderNumber: true, status: true, paymentStatus: true,
            grandTotal: true, currency: true, placedAt: true,
          },
          orderBy: { placedAt: 'desc' },
          take: 20,
        },
        _count: { select: { orders: true, reviews: true } },
      },
    });

    if (!customer) {
      throw new NotFoundException({
        message: 'That customer does not exist.',
        code: 'CUSTOMER_NOT_FOUND',
      });
    }

    const stat = (await this.statsByCustomer([customer.id])).get(customer.id);

    return {
      ...customer,
      orderCount: customer._count.orders,
      reviewCount: customer._count.reviews,
      totalSpent: (stat?.spent ?? ZERO).toFixed(2),
      lastOrderAt: stat?.lastOrderAt ?? null,
    };
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findOne(id);
    return this.prisma.db.customer.update({
      where: { id },
      data: dto as Prisma.CustomerUpdateInput,
    });
  }

  /** One grouped query for the whole page rather than one per row. */
  private async statsByCustomer(ids: string[]) {
    const empty = new Map<string, { spent: ReturnType<typeof money>; lastOrderAt: Date | null }>();
    if (ids.length === 0) return empty;

    const grouped = await this.prisma.db.order.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids }, status: { in: SPEND_STATUSES } },
      _sum: { grandTotal: true },
      _max: { placedAt: true },
    });

    return new Map(
      grouped
        .filter((g) => g.customerId !== null)
        .map((g) => [
          g.customerId!,
          {
            spent: round2(money(g._sum.grandTotal ?? 0)),
            lastOrderAt: g._max.placedAt ?? null,
          },
        ]),
    );
  }
}
