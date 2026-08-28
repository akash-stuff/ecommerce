import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainStatus, TenantStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { promises as dns } from 'node:dns';
import { PrismaService } from '../common/prisma/prisma.service';
import { TenantResolverService } from '../tenants/tenant-resolver.service';
import { AddDomainDto, DomainInstructionsDto } from './dto/domain.dto';

/** Where the TXT proof lives, so it never collides with the tenant's own records. */
const VERIFY_PREFIX = '_store-verify';

@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly resolver: TenantResolverService,
  ) {}

  findAll() {
    return this.prisma.db.domain.findMany({
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        hostname: true,
        status: true,
        isPrimary: true,
        isPlatform: true,
        verifiedAt: true,
        sslIssuedAt: true,
        createdAt: true,
      },
    });
  }

  /**
   * Claims a hostname for this tenant and returns what to put in DNS.
   *
   * The row is created PENDING and stays invisible to the resolver until it is
   * verified, so registering a hostname you do not control gets you nothing.
   */
  async add(dto: AddDomainDto): Promise<{ id: string; instructions: DomainInstructionsDto }> {
    const hostname = dto.hostname;
    const platformDomain = this.config.get<string>('platform.domain', 'platform.com');

    // Platform subdomains are handed out by the platform, not claimed here.
    if (hostname === platformDomain || hostname.endsWith(`.${platformDomain}`)) {
      throw new BadRequestException({
        message: `Subdomains of ${platformDomain} are issued automatically and cannot be added here.`,
        code: 'DOMAIN_RESERVED',
      });
    }

    // Globally unique: two tenants cannot both claim one hostname, and the
    // check is deliberately unscoped so the conflict is visible rather than a
    // confusing unique-constraint error at insert time.
    const taken = await this.prisma.runUnscoped((db) =>
      db.domain.findUnique({ where: { hostname }, select: { tenantId: true } }),
    );
    if (taken) {
      throw new ConflictException({
        message: 'That domain is already connected to a store.',
        code: 'DOMAIN_TAKEN',
      });
    }

    const created = await this.prisma.db.domain.create({
      data: {
        hostname,
        status: DomainStatus.PENDING,
        verifyToken: randomBytes(16).toString('hex'),
        isPlatform: false,
        isPrimary: false,
      } as never,
      select: { id: true, hostname: true, verifyToken: true },
    });

    return { id: created.id, instructions: this.instructions(created.hostname, created.verifyToken!) };
  }

  async getInstructions(id: string): Promise<DomainInstructionsDto> {
    const domain = await this.findOne(id);
    return this.instructions(domain.hostname, domain.verifyToken ?? '');
  }

  /**
   * Checks DNS for the ownership proof.
   *
   * Only the TXT record decides verification. Whether the hostname points at us
   * yet is reported separately as guidance: DNS propagates at its own pace, and
   * refusing to verify because an A record has not caught up would strand the
   * tenant.
   */
  async verify(id: string) {
    const domain = await this.findOne(id);

    if (domain.status === DomainStatus.ACTIVE) {
      return { status: domain.status, verified: true, ...(await this.routing(domain.hostname)) };
    }

    const token = domain.verifyToken;
    if (!token) {
      throw new BadRequestException({
        message: 'This domain has no verification token. Remove it and add it again.',
        code: 'DOMAIN_NO_TOKEN',
      });
    }

    const records = await this.lookupTxt(`${VERIFY_PREFIX}.${domain.hostname}`);
    const found = records.includes(token);

    const updated = await this.prisma.db.domain.update({
      where: { id },
      data: found
        ? { status: DomainStatus.ACTIVE, verifiedAt: new Date() }
        : { status: DomainStatus.VERIFYING },
      select: { hostname: true, status: true },
    });

    // The resolver caches "no such host" for five minutes; a newly verified
    // domain would otherwise 404 for that long after it starts working.
    if (found) await this.resolver.invalidate([domain.hostname]);

    return {
      status: updated.status,
      verified: found,
      ...(found
        ? await this.routing(domain.hostname)
        : {
            pointsHere: false,
            reachable: false,
            message: `No matching TXT record found at ${VERIFY_PREFIX}.${domain.hostname}. DNS changes can take up to an hour to propagate.`,
            found: records,
          }),
    };
  }

  /**
   * Where a verified hostname's traffic actually goes.
   *
   * Ownership and routing are separate questions and were being reported as
   * one. A TXT record proves the customer controls the domain; it says nothing
   * about whether a browser asking for it arrives here. Both are returned so
   * the console can say which of the two is missing instead of promising HTTPS
   * that will never arrive.
   */
  private async routing(hostname: string) {
    const pointsHere = await this.pointsHere(hostname);
    const reachable = await this.servesHere(hostname);

    if (reachable) return { pointsHere, reachable };

    return {
      pointsHere,
      reachable,
      message: pointsHere
        ? `DNS for ${hostname} points at this platform's configured address, but nothing there is answering as this platform. Check that PLATFORM_INGRESS_IP is the server running the proxy.`
        : `${hostname} does not resolve to this platform yet. DNS changes can take up to an hour to propagate.`,
    };
  }

  async setPrimary(id: string) {
    const domain = await this.findOne(id);

    if (domain.status !== DomainStatus.ACTIVE) {
      throw new BadRequestException({
        message: 'Verify the domain before making it primary.',
        code: 'DOMAIN_NOT_VERIFIED',
      });
    }

    return this.prisma.db.$transaction(async (tx) => {
      await tx.domain.updateMany({ where: { isPrimary: true }, data: { isPrimary: false } });
      return tx.domain.update({ where: { id }, data: { isPrimary: true } });
    });
  }

  async remove(id: string): Promise<void> {
    const domain = await this.findOne(id);

    // The platform subdomain is the fallback address; removing it could leave a
    // store with no working hostname at all.
    if (domain.isPlatform) {
      throw new BadRequestException({
        message: 'The platform subdomain cannot be removed.',
        code: 'DOMAIN_IS_PLATFORM',
      });
    }

    await this.prisma.db.domain.delete({ where: { id } });
    await this.resolver.invalidate([domain.hostname]);
  }

  /**
   * The reverse proxy's on-demand TLS gate.
   *
   * Caddy asks this before requesting a certificate for a hostname it has never
   * seen. Without it, anyone could point a DNS record at the platform and make
   * it request certificates on their behalf — a way to burn the ACME rate limit
   * and to have the platform serve names it knows nothing about.
   *
   * Deliberately unauthenticated: the proxy has no credentials. It leaks only
   * whether a hostname is a live store, which is already public.
   */
  async isAllowedForTls(hostname: string): Promise<boolean> {
    if (!hostname) return false;
    const host = hostname.toLowerCase().replace(/^www\./, '');

    const platformDomain = this.config.get<string>('platform.domain', 'platform.com');
    const adminHosts = this.config.get<string[]>('platform.adminHosts', []);

    if (adminHosts.includes(host)) return true;
    if (host === platformDomain) return true;

    // Any subdomain of the platform that maps to an active tenant.
    if (host.endsWith(`.${platformDomain}`)) {
      return (await this.resolver.resolveFromHostname(host)) !== null;
    }

    return this.prisma.runUnscoped(async (db) => {
      const domain = await db.domain.findUnique({
        where: { hostname: host },
        select: { status: true, tenant: { select: { status: true } } },
      });

      return (
        domain?.status === DomainStatus.ACTIVE &&
        domain.tenant.status === TenantStatus.ACTIVE
      );
    });
  }

  /** Records the moment a certificate was issued, for the admin UI. */
  async markSslIssued(hostname: string): Promise<void> {
    await this.prisma.runUnscoped((db) =>
      db.domain.updateMany({
        where: { hostname: hostname.toLowerCase() },
        data: { sslIssuedAt: new Date() },
      }),
    );
  }

  // ---------------------------------------------------------------------------

  private instructions(hostname: string, token: string): DomainInstructionsDto {
    const target = this.config.get<string>('platform.ingressTarget')
      ?? `ingress.${this.config.get<string>('platform.domain', 'platform.com')}`;

    // An apex domain cannot hold a CNAME, so those need an A record instead.
    const isApex = hostname.split('.').length === 2;

    return {
      hostname,
      txtName: `${VERIFY_PREFIX}.${hostname}`,
      txtValue: token,
      pointTo: isApex ? (this.config.get<string>('platform.ingressIp') ?? target) : target,
      recordType: isApex ? 'A' : 'CNAME',
    };
  }

  private async findOne(id: string) {
    const domain = await this.prisma.db.domain.findFirst({ where: { id } });
    if (!domain) {
      throw new NotFoundException({
        message: 'That domain does not exist.',
        code: 'DOMAIN_NOT_FOUND',
      });
    }
    return domain;
  }

  /** A DNS failure is "not found", never a 500 — the domain may simply not exist yet. */
  private async lookupTxt(name: string): Promise<string[]> {
    try {
      const records = await dns.resolveTxt(name);
      // Long TXT values arrive split into chunks; joining restores the token.
      return records.map((chunks) => chunks.join(''));
    } catch (error) {
      this.logger.debug(`TXT lookup failed for ${name}: ${(error as Error).message}`);
      return [];
    }
  }

  private async pointsHere(hostname: string): Promise<boolean> {
    const expectedIp = this.config.get<string>('platform.ingressIp');
    if (!expectedIp) return false;

    try {
      const addresses = await dns.resolve4(hostname);
      return addresses.includes(expectedIp);
    } catch {
      return false;
    }
  }

  /**
   * Does this platform actually answer on that hostname?
   *
   * `pointsHere` cannot tell you that. It compares DNS against
   * `PLATFORM_INGRESS_IP` — the same value that produced the instruction the
   * customer followed — so it agrees with itself whenever that setting is
   * wrong, and reports a domain as pointing here while the address serves
   * somebody else's web server entirely. That is not a hypothetical: a
   * misconfigured ingress IP verified clean and then never loaded.
   *
   * So this asks the address itself. Plain HTTP on purpose: the proxy serves
   * port 80 before any certificate exists — it has to, for the ACME challenge —
   * so this works during setup, which is exactly when it is needed.
   *
   * A `success` envelope with `status: 'ok'` is the marker. Any 200 would be
   * satisfied by the parked page or default vhost that tends to be sitting on a
   * misconfigured address.
   */
  private async servesHere(hostname: string): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`http://${hostname}/api/v1/health`, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) return false;

      const body = (await response.json()) as { data?: { status?: string } };
      return body?.data?.status === 'ok';
    } catch (error) {
      this.logger.debug(`Reachability probe failed for ${hostname}: ${(error as Error).message}`);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
