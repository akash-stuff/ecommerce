import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RequestContextStore } from '../common/context/request-context';
import { paginate, PaginatedResult, PaginationQueryDto } from '../common/dto/pagination.dto';
import { MailerService } from './mailer.service';
import {
  customerWelcome,
  orderConfirmation,
  orderStatusChanged,
  type OrderEmailData,
  type RenderedEmail,
  type StatusEmailData,
} from './templates';

/**
 * Outbound notifications.
 *
 * Every message is written to the `notifications` table *before* any attempt to
 * send it, so an email that fails is a visible QUEUED-then-FAILED row rather
 * than a silent nothing. Delivery is then attempted immediately and the row
 * updated with the outcome.
 *
 * Notifications are deliberately not tenant-scoped by the Prisma extension
 * (tenantId is nullable for platform-level notices), so every read here filters
 * by tenant explicitly.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  // --- Public senders --------------------------------------------------------

  orderPlaced(to: string, tenantId: string, data: OrderEmailData) {
    return this.deliver({
      tenantId,
      event: 'order.placed',
      to,
      payload: { orderNumber: data.orderNumber, grandTotal: data.grandTotal },
      rendered: orderConfirmation(data),
    });
  }

  orderStatus(to: string, tenantId: string, data: StatusEmailData) {
    return this.deliver({
      tenantId,
      event: `order.${data.status.toLowerCase()}`,
      to,
      payload: { orderNumber: data.orderNumber, status: data.status },
      rendered: orderStatusChanged(data),
    });
  }

  customerRegistered(
    to: string,
    tenantId: string,
    data: { storeName: string; storeEmail: string; customerName: string },
  ) {
    return this.deliver({
      tenantId,
      event: 'customer.registered',
      to,
      payload: {},
      rendered: customerWelcome(data),
    });
  }

  // --- Admin log -------------------------------------------------------------

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<unknown>> {
    const tenantId = RequestContextStore.requireTenantId();

    // Explicit tenant filter: this model is outside automatic scoping, so
    // forgetting it here would show one store another store's mail.
    const where: Prisma.NotificationWhereInput = {
      tenantId,
      ...(query.search
        ? { recipient: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const [items, total] = await this.prisma.runUnscoped((db) =>
      Promise.all([
        db.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: query.skip,
          take: query.limit,
        }),
        db.notification.count({ where }),
      ]),
    );

    return paginate(items, total, query);
  }

  /** Retries everything still queued or failed for this tenant. */
  async retryPending(): Promise<{ attempted: number; sent: number }> {
    const tenantId = RequestContextStore.requireTenantId();

    const pending = await this.prisma.runUnscoped((db) =>
      db.notification.findMany({
        where: { tenantId, status: { in: [NotificationStatus.QUEUED, NotificationStatus.FAILED] } },
        take: 50,
        orderBy: { createdAt: 'asc' },
      }),
    );

    let sent = 0;
    for (const row of pending) {
      const payload = row.payload as { html?: string; text?: string };
      // Only rows that stored their rendered body can be replayed; older rows
      // would need re-rendering from live data and are left alone.
      if (!payload.html || !payload.text || !row.subject) continue;

      const result = await this.mailer.send({
        to: row.recipient,
        subject: row.subject,
        html: payload.html,
        text: payload.text,
      });

      await this.record(row.id, result);
      if (result.sent) sent += 1;
    }

    return { attempted: pending.length, sent };
  }

  // --- Internals -------------------------------------------------------------

  /**
   * Queue, attempt, record. Never throws: a store that cannot send email must
   * still be able to take orders, so a delivery failure is logged and stored,
   * not propagated into the caller's transaction.
   */
  private async deliver(input: {
    tenantId: string;
    event: string;
    to: string;
    payload: Record<string, unknown>;
    rendered: RenderedEmail;
  }): Promise<void> {
    let notificationId: string;

    try {
      const row = await this.prisma.runUnscoped((db) =>
        db.notification.create({
          data: {
            tenantId: input.tenantId,
            channel: NotificationChannel.EMAIL,
            event: input.event,
            recipient: input.to,
            subject: input.rendered.subject,
            // The rendered body is stored so a failed send can be replayed
            // exactly as it was composed, not re-derived from changed data.
            payload: {
              ...input.payload,
              html: input.rendered.html,
              text: input.rendered.text,
            } as Prisma.InputJsonValue,
          },
        }),
      );
      notificationId = row.id;
    } catch (error) {
      this.logger.error(`Could not queue ${input.event}: ${(error as Error).message}`);
      return;
    }

    const result = await this.mailer.send({
      to: input.to,
      subject: input.rendered.subject,
      html: input.rendered.html,
      text: input.rendered.text,
    });

    await this.record(notificationId, result).catch((e) =>
      this.logger.error(`Could not record notification outcome: ${(e as Error).message}`),
    );
  }

  private record(id: string, result: { sent: boolean; reason?: string }) {
    return this.prisma.runUnscoped((db) =>
      db.notification.update({
        where: { id },
        data: result.sent
          ? { status: NotificationStatus.SENT, sentAt: new Date(), error: null }
          : { status: NotificationStatus.FAILED, error: result.reason ?? 'Unknown error' },
      }),
    );
  }
}
