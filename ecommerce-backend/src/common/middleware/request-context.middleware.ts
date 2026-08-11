import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextStore } from '../context/request-context';
import { TenantResolverService } from '../../tenants/tenant-resolver.service';

/**
 * Opens the async-local context for the request and resolves the tenant from
 * the hostname before any controller runs.
 *
 * Hostname is the source of truth for storefront traffic:
 *   acme.platform.com     -> tenant "acme"    (platform subdomain)
 *   shop.acme-corp.com    -> tenant "acme"    (verified custom domain)
 *   admin.platform.com    -> no tenant, JWT decides
 *
 * A tenant id in the body or a header is ignored entirely.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly tenantResolver: TenantResolverService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    const hostname = (req.hostname || req.headers.host || '').split(':')[0];

    res.setHeader('x-request-id', requestId);

    const context = {
      requestId,
      tenantId: null as string | null,
      userId: null,
      customerId: null,
      role: null,
      permissions: [] as string[],
      bypassTenantScope: false,
      hostname,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    // Resolution must happen inside the store so downstream lookups (which use
    // the unscoped client) share the same context object.
    RequestContextStore.run(context, () => {
      this.tenantResolver
        .resolveFromHostname(hostname)
        .then((tenantId) => {
          context.tenantId = tenantId;
          next();
        })
        .catch(next);
    });
  }
}
