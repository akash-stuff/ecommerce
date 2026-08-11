import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RequestContextStore } from '../context/request-context';
import { createTenantScopeExtension } from './tenant-scope';

/**
 * The extended client type. Services inject PrismaService and use `.db` to get
 * a client that already knows the current tenant.
 */
export type ScopedPrismaClient = ReturnType<typeof buildClient>;

/**
 * The client handed to a `$transaction` callback. `Prisma.TransactionClient` is
 * the *un-extended* type, so a service that takes one loses tenant scoping at
 * the type level; this keeps the extension in the signature.
 */
export type ScopedTransactionClient = Omit<
  ScopedPrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

function buildClient() {
  // The extension needs to re-dispatch onto the extended client, which does not
  // exist until $extends has returned — so it is handed a getter, filled in
  // immediately afterwards.
  const holder: { client?: Record<string, any> } = {};
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  }).$extends(createTenantScopeExtension(() => holder.client!));
  holder.client = client as unknown as Record<string, any>;
  return client;
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  public readonly db: ScopedPrismaClient;

  constructor() {
    this.db = buildClient();
  }

  async onModuleInit(): Promise<void> {
    await this.db.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.$disconnect();
  }

  /**
   * Escape hatch for platform-level work: super admin queries, cron jobs,
   * webhook handlers that must find the tenant before they know it.
   *
   * Deliberately verbose to call, and every call site should be reviewable.
   * Prefer runAsTenant() when the tenant is known.
   */
  async runUnscoped<T>(callback: (db: ScopedPrismaClient) => Promise<T>): Promise<T> {
    const existing = RequestContextStore.get();
    if (existing) {
      const previous = existing.bypassTenantScope;
      existing.bypassTenantScope = true;
      try {
        return await callback(this.db);
      } finally {
        existing.bypassTenantScope = previous;
      }
    }
    return RequestContextStore.run(
      {
        requestId: 'system',
        tenantId: null,
        userId: null,
        customerId: null,
        role: null,
        permissions: [],
        bypassTenantScope: true,
        hostname: 'system',
      },
      // Awaited *inside* the async-local scope: Prisma promises are lazy, so
      // returning one unawaited would execute it after the context has closed.
      async () => await callback(this.db),
    );
  }

  /** Run work as a specific tenant — used by jobs and webhook processors. */
  async runAsTenant<T>(
    tenantId: string,
    callback: (db: ScopedPrismaClient) => Promise<T>,
  ): Promise<T> {
    return RequestContextStore.run(
      {
        requestId: 'system',
        tenantId,
        userId: null,
        customerId: null,
        role: null,
        permissions: [],
        bypassTenantScope: false,
        hostname: 'system',
      },
      async () => await callback(this.db),
    );
  }
}
