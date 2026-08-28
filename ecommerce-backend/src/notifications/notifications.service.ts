import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RequestContextStore } from '../common/context/request-context';
import { paginate, PaginatedResult, PaginationQueryDto } from '../common/dto/pagination.dto';
import { MailerService, type SendResult } from './mailer.service';
import { SmsService } from './sms.service';
import { orderPlacedSms, orderStatusSms } from './sms-templates';
import {
  customerWelcome,
  emailVerificationCode,
  newsletterWelcome,
  orderConfirmation,
  orderStatusChanged,
  passwordResetCode,
  staffInvited,
  storeSetup,
  type OrderEmailData,
  type RenderedEmail,
  type StatusEmailData,
} from './templates';

/**
 * Text channels, in the order they are preferred.
 *
 * WhatsApp first where it is configured: it is cheaper than SMS, delivers
 * richer receipts, and in the markets this platform targets it is the channel
 * customers actually read. Only one is used per message — sending both is
 * paying twice to tell someone the same thing.
 */
const TEXT_CHANNELS = [NotificationChannel.WHATSAPP, NotificationChannel.SMS] as const;

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
    private readonly sms: SmsService,
  ) {}

  // --- Public senders --------------------------------------------------------

  /**
   * `phone` is optional throughout: a text message is an addition to the email,
   * never a replacement. The email is the record of the transaction and is sent
   * regardless of whether a messaging channel is configured or reachable.
   */
  async orderPlaced(
    to: string,
    tenantId: string,
    data: OrderEmailData,
    phone?: string | null,
  ): Promise<void> {
    await this.deliverEmail({
      tenantId,
      event: 'order.placed',
      to,
      payload: { orderNumber: data.orderNumber, grandTotal: data.grandTotal },
      rendered: orderConfirmation(data),
    });

    await this.deliverText({
      tenantId,
      event: 'order.placed',
      phone,
      body: orderPlacedSms(data),
      payload: { orderNumber: data.orderNumber },
    });
  }

  async orderStatus(
    to: string,
    tenantId: string,
    data: StatusEmailData,
    phone?: string | null,
  ): Promise<void> {
    await this.deliverEmail({
      tenantId,
      event: `order.${data.status.toLowerCase()}`,
      to,
      payload: { orderNumber: data.orderNumber, status: data.status },
      rendered: orderStatusChanged(data),
    });

    // Null for the statuses not worth a text; see sms-templates.
    await this.deliverText({
      tenantId,
      event: `order.${data.status.toLowerCase()}`,
      phone,
      body: orderStatusSms(data),
      payload: { orderNumber: data.orderNumber, status: data.status },
    });
  }

  customerRegistered(
    to: string,
    tenantId: string,
    data: { storeName: string; storeEmail: string; customerName: string },
  ) {
    // Email only, deliberately. A text message triggered by signing up is
    // marketing, not a transaction, and consent for it has not been asked for.
    return this.deliverEmail({
      tenantId,
      event: 'customer.registered',
      to,
      payload: {},
      rendered: customerWelcome(data),
    });
  }

  /**
   * The verification code, sent before an account exists.
   *
   * Awaited by the caller rather than fire-and-forget, unlike the welcome mail:
   * registration cannot report success if the code never went out, or the
   * shopper is left staring at a form waiting for an email that failed.
   *
   * The code is passed through to the template and deliberately kept out of
   * `payload` — that column is stored, and a stored code is a code that outlives
   * the ten minutes it was supposed to be usable for. The rendered body is
   * stored, which is unavoidable if a failed send is to be replayable, and is
   * why `forget()` clears the challenge as soon as it is spent.
   */
  emailVerificationCode(
    to: string,
    tenantId: string,
    data: {
      storeName: string;
      storeEmail: string;
      code: string;
      expiresInMinutes: number;
    },
  ) {
    return this.deliverEmail({
      tenantId,
      event: 'customer.emailVerification',
      to,
      payload: { expiresInMinutes: data.expiresInMinutes },
      rendered: emailVerificationCode(data),
    });
  }

  /**
   * The email that tells a new store owner their store exists.
   *
   * Awaited by the caller and allowed to fail *without* failing provisioning:
   * the store, its theme, its domain and its owner are already committed by the
   * time this runs, so throwing here would report a failure for work that
   * succeeded. A store with no welcome email is recoverable — the platform
   * console can resend it — while a rolled-back store is not.
   */
  storeSetup(
    to: string,
    tenantId: string,
    data: {
      storeName: string;
      ownerName: string;
      adminUrl: string;
      storefrontUrl: string;
      platformName: string;
      supportEmail: string;
    },
  ) {
    return this.deliverEmail({
      tenantId,
      event: 'store.setup',
      to,
      payload: { adminUrl: data.adminUrl, storefrontUrl: data.storefrontUrl },
      rendered: storeSetup({ ...data, email: to }),
    });
  }

  /**
   * Confirms a newsletter signup.
   *
   * Email only, and for the same reason as the welcome mail: a text message
   * nobody asked for is marketing, and consent for it was not given by typing
   * an email address into a form.
   */
  newsletterSubscribed(
    to: string,
    tenantId: string,
    data: { storeName: string; storeEmail: string; alreadySubscribed: boolean },
  ) {
    return this.deliverEmail({
      tenantId,
      event: 'newsletter.subscribed',
      to,
      payload: { alreadySubscribed: data.alreadySubscribed },
      rendered: newsletterWelcome(data),
    });
  }

  /**
   * Tells a new staff member their account exists.
   *
   * Carries no password: see the template for why a stored body must not hold
   * a credential that never expires.
   */
  staffInvited(
    to: string,
    tenantId: string,
    data: { storeName: string; storeEmail: string; firstName: string; role: string; signInUrl: string },
  ) {
    return this.deliverEmail({
      tenantId,
      event: 'staff.invited',
      to,
      payload: { role: data.role },
      rendered: staffInvited(data),
    });
  }

  /** The reset code. Awaited, like the verification one, for the same reason. */
  passwordResetCode(
    to: string,
    tenantId: string,
    data: { storeName: string; storeEmail: string; code: string; expiresInMinutes: number },
  ) {
    return this.deliverEmail({
      tenantId,
      event: 'customer.passwordReset',
      to,
      payload: { expiresInMinutes: data.expiresInMinutes },
      rendered: passwordResetCode(data),
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
  /**
   * Every store's messages, for the platform operator.
   *
   * Separate method rather than a nullable tenant on `findAll`, because the two
   * differ in exactly the way that matters: `findAll` *requires* a tenant and
   * would silently widen to the whole platform if that requirement were ever
   * relaxed by a caller passing undefined. Cross-tenant reads should have to
   * say so in their own name, and this one is reachable only from a
   * `@PlatformOnly` route.
   *
   * Each row carries the store it belongs to, since "who was this sent for" is
   * the first question an operator has about a list spanning every tenant.
   */
  async findAllAcrossPlatform(
    query: PaginationQueryDto & { tenantId?: string; status?: string; event?: string },
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.NotificationWhereInput = {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.status ? { status: query.status as NotificationStatus } : {}),
      ...(query.event ? { event: query.event } : {}),
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

    // Store names resolved in one query rather than one per row.
    const tenantIds = [...new Set(items.map((i) => i.tenantId).filter((id): id is string => !!id))];
    const tenants = await this.prisma.runUnscoped((db) =>
      db.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, slug: true, businessName: true },
      }),
    );
    const byId = new Map(tenants.map((t) => [t.id, t]));

    return paginate(
      items.map((row) => ({
        ...row,
        // Null for a platform-level notice, which has no store by design.
        store: row.tenantId
          ? {
              slug: byId.get(row.tenantId)?.slug ?? 'unknown',
              businessName: byId.get(row.tenantId)?.businessName ?? 'Deleted store',
            }
          : null,
      })),
      total,
      query,
    );
  }

  async retryPending(): Promise<{ attempted: number; sent: number }> {
    const tenantId = RequestContextStore.requireTenantId();

    const pending = await this.prisma.runUnscoped((db) =>
      db.notification.findMany({
        where: { tenantId, status: { in: [NotificationStatus.QUEUED, NotificationStatus.FAILED] } },
        take: 50,
        orderBy: { createdAt: 'asc' },
      }),
    );

    let attempted = 0;
    let sent = 0;

    for (const row of pending) {
      const result = await this.replay(row);
      // Only rows that stored enough to be re-sent are counted as attempts, so
      // "0 of 0" is reported rather than a run that appears to have failed.
      if (!result) continue;

      attempted += 1;
      await this.record(row.id, result);
      if (result.sent) sent += 1;
    }

    return { attempted, sent };
  }

  /**
   * Re-sends a stored notification on its own channel, or null if it cannot be.
   *
   * Replayed from the stored payload rather than re-rendered: the order it
   * described may have changed since, and sending a *different* message than
   * the one that failed is worse than sending nothing.
   */
  private replay(row: {
    channel: NotificationChannel;
    recipient: string;
    subject: string | null;
    payload: Prisma.JsonValue;
  }): Promise<SendResult> | null {
    const payload = (row.payload ?? {}) as { html?: string; text?: string; body?: string };

    if (row.channel === NotificationChannel.EMAIL) {
      if (!payload.html || !payload.text || !row.subject) return null;
      return this.mailer.send({
        to: row.recipient,
        subject: row.subject,
        html: payload.html,
        text: payload.text,
      });
    }

    if (
      row.channel === NotificationChannel.SMS ||
      row.channel === NotificationChannel.WHATSAPP
    ) {
      if (!payload.body) return null;
      return this.sms.send({ to: row.recipient, body: payload.body, channel: row.channel });
    }

    // IN_APP has no transport yet; its rows are left untouched rather than
    // counted as failures against a sender that does not exist.
    return null;
  }

  // --- Internals -------------------------------------------------------------

  /**
   * Queue, attempt, record. Never throws: a store that cannot send email must
   * still be able to take orders, so a delivery failure is logged and stored,
   * not propagated into the caller's transaction.
   */
  private async deliverEmail(input: {
    tenantId: string;
    event: string;
    to: string;
    payload: Record<string, unknown>;
    rendered: RenderedEmail;
  }): Promise<void> {
    const notificationId = await this.queue({
      tenantId: input.tenantId,
      channel: NotificationChannel.EMAIL,
      event: input.event,
      recipient: input.to,
      subject: input.rendered.subject,
      // The rendered body is stored so a failed send can be replayed exactly as
      // it was composed, not re-derived from changed data.
      payload: {
        ...input.payload,
        html: input.rendered.html,
        text: input.rendered.text,
      },
    });

    if (!notificationId) return;

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

  /**
   * Sends on the first configured text channel, or does nothing at all.
   *
   * Nothing is queued when there is no phone number, no configured channel, or
   * no message for this event. A QUEUED row that could never have been sent is
   * noise in the admin log and makes "retry failed" a button that can never
   * succeed — an absent notification is the honest record of a channel the
   * store has not set up.
   */
  private async deliverText(input: {
    tenantId: string;
    event: string;
    phone?: string | null;
    body: string | null;
    payload: Record<string, unknown>;
  }): Promise<void> {
    if (!input.phone || !input.body) return;

    const channel = TEXT_CHANNELS.find((c) => this.sms.isConfigured(c));
    if (!channel) return;

    const notificationId = await this.queue({
      tenantId: input.tenantId,
      channel,
      event: input.event,
      recipient: input.phone,
      subject: null,
      payload: { ...input.payload, body: input.body },
    });

    if (!notificationId) return;

    const result = await this.sms.send({ to: input.phone, body: input.body, channel });

    await this.record(notificationId, result).catch((e) =>
      this.logger.error(`Could not record notification outcome: ${(e as Error).message}`),
    );
  }

  /** Returns the row id, or null when even queuing failed. */
  private async queue(input: {
    tenantId: string;
    channel: NotificationChannel;
    event: string;
    recipient: string;
    subject: string | null;
    payload: Record<string, unknown>;
  }): Promise<string | null> {
    try {
      const row = await this.prisma.runUnscoped((db) =>
        db.notification.create({
          data: {
            tenantId: input.tenantId,
            channel: input.channel,
            event: input.event,
            recipient: input.recipient,
            subject: input.subject,
            payload: input.payload as Prisma.InputJsonValue,
          },
        }),
      );
      return row.id;
    } catch (error) {
      this.logger.error(`Could not queue ${input.event}: ${(error as Error).message}`);
      return null;
    }
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
