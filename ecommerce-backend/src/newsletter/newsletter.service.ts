import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RequestContextStore } from '../common/context/request-context';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';
import { SubscribeDto, SubscriberQueryDto } from './dto/newsletter.dto';

@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // --- Storefront ------------------------------------------------------------

  /**
   * Records an address from the storefront panel.
   *
   * The reply is the same whether this is a new signup, a repeat, or an address
   * that had opted out: "you are on the list". Saying "you were already
   * subscribed" would turn the form into a way for anyone to test whether a
   * given person shops here, and that is not a question a public endpoint
   * should answer.
   */
  async subscribe(dto: SubscribeDto): Promise<{ subscribed: true }> {
    const tenantId = RequestContextStore.requireTenantId();

    // Read first so the confirmation email can say the right thing, and so a
    // resubscribe is distinguishable in the audit trail from a first signup.
    const existing = await this.prisma.db.newsletterSubscriber.findFirst({
      where: { email: dto.email },
      select: { id: true, unsubscribedAt: true },
    });

    /**
     * findFirst-then-branch rather than `upsert`, following gateways.service.
     *
     * Prisma's `upsert` cannot insert for a tenant-scoped model: the scope
     * extension treats it as a unique write, checks the row belongs to this
     * tenant first, and throws P2025 when there is nothing to find — so an
     * upsert here would fail for exactly the first-time signup it exists to
     * handle.
     *
     * A repeat signup clears `unsubscribedAt`, because someone typing their
     * address into the form again is asking to be back on the list.
     */
    if (existing) {
      await this.prisma.db.newsletterSubscriber.update({
        where: { id: existing.id },
        data: { unsubscribedAt: null },
      });
    } else {
      try {
        // tenantId is stamped by the scope extension.
        await this.prisma.db.newsletterSubscriber.create({
          data: { email: dto.email, source: 'storefront' } as unknown as Prisma.NewsletterSubscriberCreateInput,
        });
      } catch (error) {
        /**
         * Two submissions of the same form racing each other. The unique index
         * is what makes that safe, and losing the race still means the address
         * is on the list — which is what the caller was told.
         */
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }
      }
    }

    void this.audit.record({
      action: existing ? 'newsletter.resubscribed' : 'newsletter.subscribed',
      entityType: 'NewsletterSubscriber',
      // The address is the point of the record here, unlike elsewhere in the
      // audit log — a row saying "someone subscribed" would be useless.
      changes: { email: dto.email },
    });

    const store = await this.prisma.db.store.findFirst({
      select: { name: true, email: true },
    });

    /**
     * Not awaited into the response, and a failure does not fail the request.
     *
     * The subscription is already committed by this point, so reporting an
     * error would tell the shopper their signup did not work when it did. A
     * failed send is still visible: `deliverEmail` writes a FAILED row to the
     * notifications table that the store can see and retry.
     */
    try {
      await this.notifications.newsletterSubscribed(dto.email, tenantId, {
        storeName: store?.name ?? 'The store',
        storeEmail: store?.email ?? dto.email,
        alreadySubscribed: Boolean(existing && !existing.unsubscribedAt),
      });
    } catch (error) {
      this.logger.warn(
        `Newsletter confirmation could not be sent: ${(error as Error).message}`,
      );
    }

    return { subscribed: true };
  }

  // --- Admin -----------------------------------------------------------------

  async findAll(query: SubscriberQueryDto): Promise<PaginatedResult<unknown>> {
    const where: Prisma.NewsletterSubscriberWhereInput = {
      ...(query.search
        ? { email: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
      ...(query.subscribed === undefined
        ? {}
        : query.subscribed
          ? { unsubscribedAt: null }
          : { unsubscribedAt: { not: null } }),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.newsletterSubscriber.findMany({
        where,
        select: {
          id: true,
          email: true,
          source: true,
          unsubscribedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.db.newsletterSubscriber.count({ where }),
    ]);

    return paginate(items, total, query);
  }

  /** Everyone still on the list, oldest first — the shape a mail tool wants. */
  async exportCsv(): Promise<string> {
    const rows = await this.prisma.db.newsletterSubscriber.findMany({
      where: { unsubscribedAt: null },
      select: { email: true, source: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    return [
      'email,source,signed_up_at',
      ...rows.map((r) =>
        [csvCell(r.email), csvCell(r.source), csvCell(r.createdAt.toISOString())].join(','),
      ),
    ].join('\r\n');
  }

  /**
   * Takes an address off the list on the store's behalf.
   *
   * Marked rather than deleted, so a later form submission does not quietly put
   * back someone who asked to be removed by replying to the confirmation email.
   */
  async unsubscribe(id: string) {
    const row = await this.prisma.db.newsletterSubscriber.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        message: 'That subscriber does not exist.',
        code: 'SUBSCRIBER_NOT_FOUND',
      });
    }

    const updated = await this.prisma.db.newsletterSubscriber.update({
      where: { id },
      data: { unsubscribedAt: row.unsubscribedAt ?? new Date() },
    });

    void this.audit.record({
      action: 'newsletter.unsubscribed',
      entityType: 'NewsletterSubscriber',
      entityId: id,
      changes: { email: row.email },
    });

    return { id: updated.id, unsubscribedAt: updated.unsubscribedAt };
  }

  /** Deletes the row outright, for a removal request that has to leave nothing. */
  async remove(id: string) {
    const row = await this.prisma.db.newsletterSubscriber.findFirst({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        message: 'That subscriber does not exist.',
        code: 'SUBSCRIBER_NOT_FOUND',
      });
    }

    await this.prisma.db.newsletterSubscriber.delete({ where: { id } });

    void this.audit.record({
      action: 'newsletter.deleted',
      entityType: 'NewsletterSubscriber',
      entityId: id,
      changes: { email: row.email },
    });
  }
}

/**
 * One CSV cell, quoted and defused.
 *
 * A leading `=`, `+`, `-` or `@` makes Excel and Sheets treat the cell as a
 * formula and run it when the file is opened. Every address in this export was
 * typed into a public form by a stranger, so that is a live injection path into
 * the shopkeeper's own spreadsheet: `=HYPERLINK(...)` in the email column is a
 * link they will click.
 *
 * A leading apostrophe forces the cell to text. Quotes are doubled and the whole
 * value wrapped, per RFC 4180.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
