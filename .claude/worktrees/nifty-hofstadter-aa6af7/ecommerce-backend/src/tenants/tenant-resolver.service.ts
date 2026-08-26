import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CacheService } from '../common/cache/cache.service';

/**
 * Maps an incoming hostname to a tenant id.
 *
 * Every storefront request hits this, so results are cached in Redis. Cache is
 * invalidated when a domain is added/verified or a tenant is suspended — see
 * TenantsService.
 */
@Injectable()
export class TenantResolverService {
  private readonly logger = new Logger(TenantResolverService.name);
  private readonly ttlSeconds = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {}

  async resolveFromHostname(hostname: string): Promise<string | null> {
    if (!hostname) return null;

    const host = hostname.toLowerCase().replace(/^www\./, '');
    const cacheKey = `tenant:host:${host}`;

    const cached = await this.cache.get<string | 'none'>(cacheKey);
    if (cached) return cached === 'none' ? null : cached;

    const tenantId = await this.lookup(host);
    await this.cache.set(cacheKey, tenantId ?? 'none', this.ttlSeconds);
    return tenantId;
  }

  private async lookup(host: string): Promise<string | null> {
    const platformDomain = this.config.get<string>('platform.domain', 'platform.com');
    const adminHosts = this.config.get<string[]>('platform.adminHosts', []);

    // Admin/API hostnames are intentionally tenant-less: the JWT decides.
    if (adminHosts.includes(host)) return null;

    return this.prisma.runUnscoped(async (db) => {
      // 1. Platform subdomain: acme.platform.com -> slug "acme"
      if (host.endsWith(`.${platformDomain}`)) {
        const slug = host.slice(0, -(platformDomain.length + 1));
        if (!slug || slug.includes('.')) return null;

        const tenant = await db.tenant.findUnique({
          where: { slug },
          select: { id: true, status: true },
        });
        return this.activeOrNull(tenant, host);
      }

      // 2. Custom domain — must be verified. An unverified row resolves to
      //    nothing so a squatted hostname cannot borrow a tenant's data.
      const domain = await db.domain.findUnique({
        where: { hostname: host },
        select: { tenantId: true, status: true, tenant: { select: { status: true } } },
      });

      if (!domain || domain.status !== 'ACTIVE') return null;
      if (domain.tenant.status !== TenantStatus.ACTIVE) return null;
      return domain.tenantId;
    });
  }

  private activeOrNull(
    tenant: { id: string; status: TenantStatus } | null,
    host: string,
  ): string | null {
    if (!tenant) return null;
    if (tenant.status !== TenantStatus.ACTIVE) {
      this.logger.warn(`Request for ${host} rejected: tenant is ${tenant.status}`);
      return null;
    }
    return tenant.id;
  }

  async invalidate(hostnames: string[]): Promise<void> {
    await Promise.all(
      hostnames.map((h) => this.cache.del(`tenant:host:${h.toLowerCase().replace(/^www\./, '')}`)),
    );
  }
}
