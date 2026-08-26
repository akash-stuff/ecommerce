import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RequestContextStore } from '../common/context/request-context';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';
import { AuditQueryDto } from './dto/audit.dto';

/**
 * Field names whose values must never reach the audit log.
 *
 * Matched by substring against the lower-cased key, so `passwordHash`,
 * `newPassword` and `refreshToken` are all caught. An audit trail that records
 * the secret being changed is worse than no audit trail: it turns a log anyone
 * with read access can see into a credential store.
 */
const REDACTED_KEYS = [
  'password',
  'secret',
  'token',
  'hash',
  'apikey',
  'authorization',
  'cvv',
  'card',
];

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Before/after, or whatever describes the change. Redacted before storing. */
  changes?: Record<string, unknown> | null;
  /** Overrides the tenant from context — used by platform-level actions. */
  tenantId?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an action. Never throws and never blocks the caller's outcome — a
   * failed audit write must not roll back the change it was describing, or an
   * audit outage becomes a platform outage.
   *
   * Deliberately not awaited by most callers.
   */
  async record(entry: AuditEntry): Promise<void> {
    const ctx = RequestContextStore.get();

    try {
      await this.prisma.runUnscoped((db) =>
        db.auditLog.create({
          data: {
            // Explicit tenantId wins so a platform action against a tenant is
            // attributed to that tenant rather than to nobody.
            tenantId: entry.tenantId ?? ctx?.tenantId ?? null,
            userId: ctx?.userId ?? null,
            action: entry.action,
            entityType: entry.entityType,
            entityId: entry.entityId ?? null,
            changes: entry.changes
              ? (redact(entry.changes) as Prisma.InputJsonValue)
              : undefined,
            ipAddress: ctx?.ipAddress ?? null,
            userAgent: ctx?.userAgent ?? null,
            requestId: ctx?.requestId ?? null,
          },
        }),
      );
    } catch (error) {
      this.logger.error(
        `Could not record audit entry ${entry.action} on ${entry.entityType}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * The current tenant's own trail. `tenantId` from the query is ignored here —
   * a store owner must not be able to read another store's log by supplying one.
   */
  async findForTenant(query: AuditQueryDto): Promise<PaginatedResult<unknown>> {
    return this.list(query, RequestContextStore.requireTenantId());
  }

  /** Everything, across every tenant. Platform-only. */
  async findAll(query: AuditQueryDto): Promise<PaginatedResult<unknown>> {
    return this.list(query, query.tenantId ?? undefined);
  }

  private async list(
    query: AuditQueryDto,
    tenantId?: string,
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(query.action ? { action: { contains: query.action, mode: 'insensitive' } } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
    };

    const [items, total] = await this.prisma.runUnscoped((db) =>
      Promise.all([
        db.auditLog.findMany({
          where,
          include: {
            user: { select: { email: true, firstName: true, lastName: true } },
            tenant: { select: { slug: true, businessName: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: query.skip,
          take: query.limit,
        }),
        db.auditLog.count({ where }),
      ]),
    );

    return paginate(items, total, query);
  }
}

/**
 * Recursive so a secret nested inside a `before`/`after` pair is caught too.
 * Redacted values are replaced rather than removed, so the log still shows that
 * the field changed.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, v]) => {
      const lower = key.toLowerCase();
      if (REDACTED_KEYS.some((needle) => lower.includes(needle))) {
        return [key, '[redacted]'];
      }
      return [key, redact(v, depth + 1)];
    }),
  );
}
