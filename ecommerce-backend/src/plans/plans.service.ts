import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TenantStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';

/**
 * Subscription plans are platform-level: one catalogue shared by every tenant.
 * Nothing here is tenant-scoped, so every query runs unscoped by necessity —
 * which is why this module is reachable only by a super admin.
 */
@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Includes how many tenants are on each plan, which is what makes it useful. */
  findAll() {
    return this.prisma.runUnscoped((db) =>
      db.plan.findMany({
        orderBy: { priceMonthly: 'asc' },
        include: {
          _count: { select: { subscriptions: true } },
        },
      }),
    );
  }

  async create(dto: CreatePlanDto) {
    const slug = dto.slug ?? slugify(dto.name);

    const clash = await this.prisma.runUnscoped((db) =>
      db.plan.findFirst({
        where: { OR: [{ slug }, { name: dto.name }] },
        select: { id: true },
      }),
    );
    if (clash) {
      throw new ConflictException({
        message: 'A plan with that name or slug already exists.',
        code: 'PLAN_EXISTS',
      });
    }

    const plan = await this.prisma.runUnscoped((db) =>
      db.plan.create({ data: { ...dto, slug } as Prisma.PlanCreateInput }),
    );

    void this.audit.record({
      action: 'plan.created',
      entityType: 'Plan',
      entityId: plan.id,
      changes: { name: plan.name, priceMonthly: plan.priceMonthly.toFixed(2) },
    });

    return plan;
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.findOne(id);

    const plan = await this.prisma.runUnscoped((db) =>
      db.plan.update({ where: { id }, data: dto as Prisma.PlanUpdateInput }),
    );

    void this.audit.record({
      action: 'plan.updated',
      entityType: 'Plan',
      entityId: id,
      changes: dto as Record<string, unknown>,
    });

    return plan;
  }

  /**
   * Retired rather than deleted, and refused while anyone is on it. Deleting a
   * plan that subscriptions point at would either break the foreign key or
   * leave tenants with no plan and no record of what they were paying for.
   */
  async deactivate(id: string) {
    const plan = await this.findOne(id);

    const active = await this.prisma.runUnscoped((db) =>
      db.subscription.count({
        where: { planId: id, tenant: { status: { not: TenantStatus.CANCELLED } } },
      }),
    );

    if (active > 0) {
      throw new ConflictException({
        message: `${active} store${active === 1 ? ' is' : 's are'} still on this plan. Move them first.`,
        code: 'PLAN_IN_USE',
      });
    }

    void this.audit.record({
      action: 'plan.deactivated',
      entityType: 'Plan',
      entityId: id,
      changes: { name: plan.name },
    });

    return this.prisma.runUnscoped((db) =>
      db.plan.update({ where: { id }, data: { isActive: false } }),
    );
  }

  private async findOne(id: string) {
    const plan = await this.prisma.runUnscoped((db) => db.plan.findUnique({ where: { id } }));
    if (!plan) {
      throw new NotFoundException({
        message: 'That plan does not exist.',
        code: 'PLAN_NOT_FOUND',
      });
    }
    return plan;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}
