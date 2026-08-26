import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RequestContextStore } from '../common/context/request-context';
import { AuditService } from '../audit/audit.service';
import { SecretBox, isSealedSecret, type SealedSecret } from '../common/crypto/secret-box';
import { CodProvider } from './providers/cod.provider';
import { RazorpayProvider } from './providers/razorpay.provider';
import type { GatewayCredentials, PaymentProvider } from './payment-provider';
import type { UpsertGatewayDto } from './dto/gateway.dto';

/** What the admin is allowed to see. Never a secret, only whether one is set. */
export interface GatewayView {
  provider: string;
  label: string | null;
  isEnabled: boolean;
  publicKey: string | null;
  /** Which secret fields currently hold a value. */
  secretsSet: string[];
  /** True when this store could actually take a payment through it right now. */
  ready: boolean;
  credentialFields: PaymentProvider['credentialFields'];
  updatedAt: Date | null;
}

/**
 * A store's payment connections.
 *
 * Two rules run through everything here. Secrets go in encrypted and never come
 * back out through the API — the admin is told which fields are set, not what
 * they contain, because a settings page that renders a key secret into HTML has
 * put it in browser history, screenshots and support tickets. And a gateway is
 * offered at checkout only when it is both switched on *and* complete, so a
 * half-finished setup cannot produce a payment button that fails.
 */
@Injectable()
export class GatewaysService {
  private readonly providers = new Map<string, PaymentProvider>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly box: SecretBox,
    cod: CodProvider,
    razorpay: RazorpayProvider,
  ) {
    for (const provider of [cod, razorpay]) {
      this.providers.set(provider.name, provider);
    }
  }

  provider(name: string): PaymentProvider | undefined {
    return this.providers.get(name.toUpperCase());
  }

  /** Every provider the platform supports, with this store's setup state. */
  async list(): Promise<GatewayView[]> {
    const rows = await this.prisma.db.paymentGateway.findMany();
    const byProvider = new Map(rows.map((r) => [r.provider, r]));

    return [...this.providers.values()].map((provider) => {
      const row = byProvider.get(provider.name);
      const credentials = row ? this.decrypt(row) : null;

      return {
        provider: provider.name,
        label: row?.label ?? null,
        isEnabled: row?.isEnabled ?? false,
        publicKey: row?.publicKey ?? null,
        secretsSet: Object.keys((row?.secrets ?? {}) as Record<string, unknown>),
        ready: Boolean(row?.isEnabled) && provider.isConfigured(credentials),
        credentialFields: provider.credentialFields,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  /**
   * Creates or updates this store's connection to one provider.
   *
   * An omitted secret leaves the stored one alone; an empty string clears it.
   * That distinction is the whole reason secrets are not returned: without it,
   * a settings form that round-trips a masked value would save the mask.
   */
  async upsert(providerName: string, dto: UpsertGatewayDto): Promise<GatewayView[]> {
    const provider = this.providers.get(providerName.toUpperCase());
    if (!provider) {
      throw new NotFoundException({
        message: 'That payment provider is not supported.',
        code: 'PAYMENT_PROVIDER_UNKNOWN',
      });
    }

    const known = new Set(provider.credentialFields.map((f) => f.name));
    for (const name of Object.keys(dto.secrets ?? {})) {
      if (!known.has(name)) {
        throw new BadRequestException({
          message: `${provider.name} has no credential called "${name}".`,
          code: 'PAYMENT_CREDENTIAL_UNKNOWN',
        });
      }
    }

    const existing = await this.prisma.db.paymentGateway.findFirst({
      where: { provider: provider.name },
    });

    const secrets: Record<string, SealedSecret> = {
      ...((existing?.secrets ?? {}) as unknown as Record<string, SealedSecret>),
    };

    for (const [name, value] of Object.entries(dto.secrets ?? {})) {
      if (value === '') {
        delete secrets[name];
        continue;
      }
      if (value === undefined || value === null) continue;
      secrets[name] = this.box.seal(
        value.trim(),
        this.aad(RequestContextStore.requireTenantId(), provider.name, name),
      );
    }

    const data = {
      provider: provider.name,
      isEnabled: dto.isEnabled ?? existing?.isEnabled ?? false,
      label: dto.label !== undefined ? dto.label || null : (existing?.label ?? null),
      publicKey:
        dto.publicKey !== undefined
          ? dto.publicKey.trim() || null
          : (existing?.publicKey ?? null),
      secrets: secrets as unknown as Prisma.InputJsonValue,
    };

    if (existing) {
      await this.prisma.db.paymentGateway.update({ where: { id: existing.id }, data });
    } else {
      await this.prisma.db.paymentGateway.create({
        // tenantId is stamped by the tenant-scope extension.
        data: data as unknown as Prisma.PaymentGatewayCreateInput,
      });
    }

    /**
     * The audit trail records *which* fields moved, never their values. An
     * audit log holding a live gateway secret is a second copy of the thing we
     * went to the trouble of encrypting.
     */
    void this.audit.record({
      action: existing ? 'paymentGateway.updated' : 'paymentGateway.connected',
      entityType: 'PaymentGateway',
      entityId: existing?.id ?? provider.name,
      changes: {
        provider: provider.name,
        isEnabled: data.isEnabled,
        secretsChanged: Object.keys(dto.secrets ?? {}),
        publicKeyChanged: dto.publicKey !== undefined,
      },
    });

    return this.list();
  }

  /** Forgets the credentials entirely. Past payments keep their own records. */
  async disconnect(providerName: string): Promise<GatewayView[]> {
    const provider = this.providers.get(providerName.toUpperCase());
    if (!provider) {
      throw new NotFoundException({
        message: 'That payment provider is not supported.',
        code: 'PAYMENT_PROVIDER_UNKNOWN',
      });
    }

    const existing = await this.prisma.db.paymentGateway.findFirst({
      where: { provider: provider.name },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.db.paymentGateway.delete({ where: { id: existing.id } });
      void this.audit.record({
        action: 'paymentGateway.disconnected',
        entityType: 'PaymentGateway',
        entityId: existing.id,
        changes: { provider: provider.name },
      });
    }

    return this.list();
  }

  /**
   * The providers this store can actually take money through, in the order
   * checkout should offer them.
   */
  async availableFor(): Promise<string[]> {
    const rows = await this.prisma.db.paymentGateway.findMany({ where: { isEnabled: true } });

    return rows
      .filter((row) => {
        const provider = this.providers.get(row.provider);
        return provider?.isConfigured(this.decrypt(row)) ?? false;
      })
      .map((row) => row.provider)
      // COD first: it is the one that always works, so it should not be buried
      // under a gateway the shopper may not want to use.
      .sort((a, b) => (a === 'COD' ? -1 : b === 'COD' ? 1 : a.localeCompare(b)));
  }

  /** This store's decrypted credentials for one provider, or null. */
  async credentialsFor(providerName: string): Promise<GatewayCredentials | null> {
    const row = await this.prisma.db.paymentGateway.findFirst({
      where: { provider: providerName.toUpperCase(), isEnabled: true },
    });
    return row ? this.decrypt(row) : null;
  }

  /**
   * As above, but for a tenant named explicitly rather than resolved from the
   * request — the webhook path, where the caller is a gateway and the tenant was
   * discovered from the payment the payload points at.
   */
  async credentialsForTenant(
    tenantId: string,
    providerName: string,
  ): Promise<GatewayCredentials | null> {
    // `isEnabled` is deliberately not required here. A capture notification for
    // a payment taken last week must still be honoured if the store has since
    // switched the gateway off — otherwise turning it off silently strands paid
    // orders as unpaid.
    const row = await this.prisma.runUnscoped((db) =>
      db.paymentGateway.findFirst({
        where: { tenantId, provider: providerName.toUpperCase() },
      }),
    );
    return row ? this.decrypt(row) : null;
  }

  private decrypt(row: {
    tenantId: string;
    provider: string;
    publicKey: string | null;
    secrets: unknown;
  }): GatewayCredentials {
    const sealed = (row.secrets ?? {}) as Record<string, unknown>;
    const secrets: Record<string, string> = {};

    for (const [name, envelope] of Object.entries(sealed)) {
      // A secret that will not open is treated as absent, which surfaces as
      // "not configured" rather than as a 500 on someone's checkout. That is
      // the honest outcome after a key rotation: the store has to re-enter it.
      if (!isSealedSecret(envelope)) continue;
      try {
        secrets[name] = this.box.open(
          envelope,
          this.aad(row.tenantId, row.provider, name),
        );
      } catch {
        continue;
      }
    }

    return { publicKey: row.publicKey, secrets };
  }

  /**
   * Binds an envelope to the tenant, provider and field it was stored under.
   *
   * One key encrypts every tenant's secrets, so without this a ciphertext
   * copied from another store's row — by anyone who can write the database —
   * would decrypt cleanly and route that store's payments through the wrong
   * merchant account. With it, a moved envelope simply fails to open.
   */
  private aad(tenantId: string, provider: string, field: string): string {
    return `paymentGateway:${tenantId}:${provider}:${field}`;
  }
}
