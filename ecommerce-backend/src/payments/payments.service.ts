import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { money } from '../common/money';
import { GatewaysService } from './gateways.service';
import type { GatewayCredentials, PaymentProvider } from './payment-provider';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateways: GatewaysService,
  ) {}

  /**
   * What this store may offer. A gateway is offered only when the shopkeeper
   * switched it on and its credentials are complete — see GatewaysService.
   */
  availableProviders(): Promise<string[]> {
    return this.gateways.availableFor();
  }

  /**
   * The provider plus *this store's* credentials for it.
   *
   * Resolved together because neither is useful alone: the class knows how to
   * talk to Razorpay, the row knows whose Razorpay account to talk to. Refusing
   * here is what stops a store taking a payment it has not connected — money
   * would otherwise land in whichever account the platform happened to hold.
   */
  private async resolve(
    name: string,
  ): Promise<{ provider: PaymentProvider; credentials: GatewayCredentials | null }> {
    const provider = this.gateways.provider(name);
    const credentials = provider ? await this.gateways.credentialsFor(provider.name) : null;

    const enabled = provider ? (await this.gateways.availableFor()).includes(provider.name) : false;

    if (!provider || !enabled || !provider.isConfigured(credentials)) {
      throw new BadRequestException({
        message: 'That payment method is not available at this store.',
        code: 'PAYMENT_PROVIDER_UNAVAILABLE',
      });
    }

    return { provider, credentials };
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

    const { provider, credentials } = await this.resolve(providerName);

    const intent = await provider.createIntent(
      {
        orderNumber: order.orderNumber,
        amount: order.grandTotal.toFixed(2),
        currency: order.currency,
        customerEmail: order.customerEmail,
      },
      credentials,
    );

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
   * The shopper's browser reporting a completed payment.
   *
   * Trusted only because of the signature: the payload comes from a page the
   * shopper controls, so it is verified against this store's key secret before
   * anything is believed. It exists so the confirmation page can say "paid"
   * immediately — the webhook is authoritative but may be seconds late, or
   * never arrive at all on a laptop the internet cannot reach.
   *
   * Applying the same verdict twice is safe: `applyVerdict` sets the payment and
   * order to PAID, which is idempotent, and the webhook's own replay guard is
   * unaffected because that keys on the provider's event id, not on this.
   */
  async confirmReturn(
    orderNumber: string,
    providerName: string,
    payload: Record<string, string>,
  ): Promise<{ paid: boolean; orderNumber: string }> {
    const { provider, credentials } = await this.resolve(providerName);

    if (!provider.verifyReturn) {
      throw new BadRequestException({
        message: 'That payment method has nothing to confirm.',
        code: 'PAYMENT_RETURN_UNSUPPORTED',
      });
    }

    const { reference } = provider.verifyReturn(payload, credentials);

    /**
     * The signature proves the gateway issued it; this proves it belongs to the
     * order being claimed. Without the check, a valid signature from one of the
     * shopper's own payments could be replayed against a different order.
     */
    const payment = await this.prisma.db.payment.findFirst({
      where: { providerRef: reference, provider: provider.name },
      select: { id: true, order: { select: { orderNumber: true } } },
    });

    if (!payment || payment.order.orderNumber !== orderNumber) {
      throw new BadRequestException({
        message: 'That payment does not belong to this order.',
        code: 'PAYMENT_ORDER_MISMATCH',
      });
    }

    // Amount is not re-asserted here: the gateway order was created from this
    // order's total, and `applyVerdict` compares against the stored amount when
    // the webhook supplies one.
    await this.applyVerdict(reference, {
      outcome: 'paid',
      amount: null,
      failureReason: null,
    });

    return { paid: true, orderNumber };
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
    const provider = this.gateways.provider(providerName);
    if (!provider) {
      throw new BadRequestException({
        message: 'Unknown payment provider.',
        code: 'PAYMENT_PROVIDER_UNKNOWN',
      });
    }

    /**
     * Which store's secret verifies this?
     *
     * Each store connects its own gateway account, so there is no single
     * webhook secret any more — and the request arrives on the bare API
     * hostname with no tenant. The gateway's own reference is read from the
     * *unverified* body, used to find the payment row it names, and that row
     * names the tenant whose secret then has to verify the signature.
     *
     * Reading before verifying is safe because nothing is believed: a forged
     * or misdirected reference finds either no payment or the wrong store's
     * secret, and the signature check below fails either way. What it cannot do
     * is make an unsigned payload look paid.
     */
    const reference = provider.referenceFromUnverifiedBody(rawBody);
    const tenantId = reference ? await this.tenantForReference(reference) : null;

    if (!tenantId) {
      // Deliberately the same answer as a bad signature. Telling a caller that
      // a reference is unknown to us is a way to enumerate what is.
      throw new UnauthorizedException({
        message: 'Webhook could not be attributed to a store.',
        code: 'WEBHOOK_UNATTRIBUTED',
      });
    }

    const credentials = await this.gateways.credentialsForTenant(tenantId, provider.name);
    const verdict = provider.verifyWebhook(rawBody, headers, credentials);

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
          // Now known, and worth keeping: a stored event with no tenant cannot
          // be replayed against the right store later.
          tenantId,
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
   * The tenant that owns the payment a gateway reference names.
   *
   * Unscoped by necessity: the request came from a payment provider, not from a
   * tenant hostname, so there is no scope to run inside yet. Selects only the
   * tenant id — this runs before anything has been verified, so it must not be
   * a way to read a payment's amounts or status.
   */
  private async tenantForReference(reference: string): Promise<string | null> {
    const payment = await this.prisma.runUnscoped((db) =>
      db.payment.findFirst({
        where: { providerRef: reference },
        select: { tenantId: true },
      }),
    );
    return payment?.tenantId ?? null;
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
