import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { money } from '../common/money';
import { CodProvider } from './providers/cod.provider';
import { RazorpayProvider } from './providers/razorpay.provider';
import type { PaymentProvider } from './payment-provider';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly providers = new Map<string, PaymentProvider>();

  constructor(
    private readonly prisma: PrismaService,
    cod: CodProvider,
    razorpay: RazorpayProvider,
  ) {
    for (const provider of [cod, razorpay]) {
      this.providers.set(provider.name, provider);
    }
  }

  /** What the storefront may offer. An unconfigured gateway is not offered. */
  availableProviders(): string[] {
    return [...this.providers.values()]
      .filter((p) => p.isConfigured())
      .map((p) => p.name);
  }

  private provider(name: string): PaymentProvider {
    const provider = this.providers.get(name.toUpperCase());
    if (!provider || !provider.isConfigured()) {
      throw new BadRequestException({
        message: 'That payment method is not available at this store.',
        code: 'PAYMENT_PROVIDER_UNAVAILABLE',
      });
    }
    return provider;
  }

  /**
   * Starts a payment attempt for an existing order and returns whatever the
   * browser needs to continue. Called after checkout, so a failed payment leaves
   * a real order to retry against rather than losing the cart.
   */
  async initiate(orderNumber: string, providerName: string) {
    const order = await this.prisma.db.order.findFirst({
      where: { orderNumber },
      select: {
        id: true, orderNumber: true, grandTotal: true, currency: true,
        customerEmail: true, paymentStatus: true,
      },
    });

    if (!order) {
      throw new NotFoundException({
        message: 'That order does not exist.',
        code: 'ORDER_NOT_FOUND',
      });
    }

    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException({
        message: 'That order is already paid.',
        code: 'ORDER_ALREADY_PAID',
      });
    }

    const provider = this.provider(providerName);

    const intent = await provider.createIntent({
      orderNumber: order.orderNumber,
      amount: order.grandTotal.toFixed(2),
      currency: order.currency,
      customerEmail: order.customerEmail,
    });

    await this.prisma.db.payment.create({
      data: {
        orderId: order.id,
        provider: provider.name,
        providerRef: intent.reference,
        status: PaymentStatus.PENDING,
        amount: order.grandTotal,
        currency: order.currency,
      } as unknown as Prisma.PaymentCreateInput,
    });

    return { orderNumber: order.orderNumber, ...intent.clientPayload };
  }

  /**
   * Handles a provider webhook.
   *
   * Two things make this safe to receive more than once, which providers
   * guarantee they will do: the signature is verified before anything is
   * believed, and the (provider, eventId) unique index means a replay is
   * recorded as already-seen and dropped rather than applied twice. Without
   * that, a retried `payment.captured` could refund or double-count.
   */
  async handleWebhook(
    providerName: string,
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): Promise<{ received: true; duplicate: boolean }> {
    const provider = this.provider(providerName);
    const verdict = provider.verifyWebhook(rawBody, headers);

    // Webhooks arrive before the tenant is known, so this table is deliberately
    // outside tenant scoping (see PLATFORM_MANAGED_TENANT_MODELS).
    const alreadySeen = await this.prisma.runUnscoped((db) =>
      db.webhookEvent.findFirst({
        where: { provider: provider.name, eventId: verdict.eventId },
        select: { id: true, processedAt: true },
      }),
    );

    if (alreadySeen) {
      this.logger.log(`Ignoring replayed ${provider.name} event ${verdict.eventId}`);
      return { received: true, duplicate: true };
    }

    const event = await this.prisma.runUnscoped((db) =>
      db.webhookEvent.create({
        data: {
          provider: provider.name,
          eventId: verdict.eventId,
          eventType: verdict.eventType,
          payload: JSON.parse(rawBody) as Prisma.InputJsonValue,
        },
      }),
    );

    if (verdict.outcome === 'ignored' || !verdict.reference) {
      await this.markProcessed(event.id, null);
      return { received: true, duplicate: false };
    }

    try {
      await this.applyVerdict(verdict.reference, verdict);
      await this.markProcessed(event.id, null);
    } catch (error) {
      const message = (error as Error).message;
      await this.markProcessed(event.id, message);
      this.logger.error(`Webhook ${verdict.eventId} failed: ${message}`);
      // Swallowed on purpose: a 500 makes the provider retry forever on a
      // payload we have already stored and can replay ourselves.
    }

    return { received: true, duplicate: false };
  }

  /**
   * Applies a verified outcome to the payment and its order.
   *
   * Runs unscoped because the tenant is discovered *from* the payment row — the
   * request itself came from a provider, not from a tenant hostname.
   */
  private async applyVerdict(
    reference: string,
    verdict: { outcome: string; amount: string | null; failureReason: string | null },
  ): Promise<void> {
    await this.prisma.runUnscoped(async (db) => {
      const payment = await db.payment.findFirst({
        where: { providerRef: reference },
        select: { id: true, orderId: true, tenantId: true, amount: true },
      });

      if (!payment) {
        throw new Error(`No payment found for provider reference ${reference}`);
      }

      // The amount the provider says it took must match what was owed, or this
      // is not the payment we think it is.
      if (verdict.amount && !money(verdict.amount).equals(money(payment.amount))) {
        throw new Error(
          `Amount mismatch for ${reference}: provider says ${verdict.amount}, order says ${payment.amount}`,
        );
      }

      if (verdict.outcome === 'paid') {
        await db.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.PAID, capturedAt: new Date() },
        });
        await db.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: PaymentStatus.PAID, status: OrderStatus.CONFIRMED },
        });
        return;
      }

      if (verdict.outcome === 'failed') {
        await db.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.FAILED,
            failureReason: verdict.failureReason ?? 'Declined',
          },
        });
        // The order stays PENDING on purpose: the customer can retry payment
        // without rebuilding the cart, and the stock stays held meanwhile.
        await db.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: PaymentStatus.FAILED },
        });
        return;
      }

      if (verdict.outcome === 'refunded') {
        await db.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.REFUNDED,
            refundedAmount: verdict.amount ? money(verdict.amount) : payment.amount,
          },
        });
        await db.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: PaymentStatus.REFUNDED, status: OrderStatus.REFUNDED },
        });
      }
    });
  }

  /**
   * Records cash collected on delivery. This is the COD equivalent of a
   * webhook, done by a person, so it is permission-guarded rather than signed.
   */
  async markCollected(orderId: string) {
    const order = await this.prisma.db.order.findFirst({
      where: { id: orderId },
      include: { payments: { where: { provider: 'COD' }, take: 1 } },
    });

    if (!order) {
      throw new NotFoundException({
        message: 'That order does not exist.',
        code: 'ORDER_NOT_FOUND',
      });
    }
    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException({
        message: 'That order is already paid.',
        code: 'ORDER_ALREADY_PAID',
      });
    }

    const payment = order.payments[0];
    if (payment) {
      await this.prisma.db.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.PAID, capturedAt: new Date() },
      });
    }

    return this.prisma.db.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: PaymentStatus.PAID,
        ...(order.status === OrderStatus.PENDING
          ? { status: OrderStatus.CONFIRMED }
          : {}),
      },
    });
  }

  private markProcessed(eventId: string, error: string | null) {
    return this.prisma.runUnscoped((db) =>
      db.webhookEvent.update({
        where: { id: eventId },
        data: { processedAt: new Date(), error },
      }),
    );
  }
}
