import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentIntent, PaymentProvider, WebhookVerdict } from '../payment-provider';

/**
 * Razorpay.
 *
 * `isConfigured()` gates everything: with no credentials the provider reports
 * itself unavailable and checkout refuses ONLINE payment rather than pretending
 * to accept one. Development rule 18 — no fake APIs — means an unconfigured
 * gateway must fail visibly, not simulate success.
 */
@Injectable()
export class RazorpayProvider implements PaymentProvider {
  readonly name = 'RAZORPAY';
  private readonly logger = new Logger(RazorpayProvider.name);

  constructor(private readonly config: ConfigService) {}

  private get keyId(): string {
    return this.config.get<string>('razorpay.keyId') ?? '';
  }

  private get keySecret(): string {
    return this.config.get<string>('razorpay.keySecret') ?? '';
  }

  private get webhookSecret(): string {
    return this.config.get<string>('razorpay.webhookSecret') ?? '';
  }

  isConfigured(): boolean {
    return Boolean(this.keyId && this.keySecret);
  }

  /**
   * Creates a Razorpay order. Amounts go over the wire in the smallest currency
   * unit, so rupees become paise — getting this wrong charges a hundredth or a
   * hundred times the intended amount.
   */
  async createIntent(input: {
    orderNumber: string;
    amount: string;
    currency: string;
  }): Promise<PaymentIntent> {
    const paise = Math.round(Number.parseFloat(input.amount) * 100);
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: paise,
        currency: input.currency,
        receipt: input.orderNumber,
        notes: { orderNumber: input.orderNumber },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      this.logger.error(`Razorpay order creation failed: ${response.status} ${detail}`);
      throw new Error('Could not start the payment. Try again.');
    }

    const order = (await response.json()) as { id: string; amount: number };

    return {
      reference: order.id,
      // The key id is publishable by design; the secret never leaves the server.
      clientPayload: {
        provider: 'RAZORPAY',
        keyId: this.keyId,
        razorpayOrderId: order.id,
        amount: order.amount,
        currency: input.currency,
      },
    };
  }

  /**
   * HMAC-SHA256 over the exact bytes received, compared in constant time.
   *
   * The raw body matters: re-serialising the parsed JSON changes key order and
   * whitespace, and the signature would never match.
   */
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>,
  ): WebhookVerdict {
    const signature = headers['x-razorpay-signature'];
    if (!signature || !this.webhookSecret) {
      throw new UnauthorizedException({
        message: 'Unsigned webhook.',
        code: 'WEBHOOK_UNSIGNED',
      });
    }

    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest();
    const received = Buffer.from(signature, 'hex');

    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new UnauthorizedException({
        message: 'Webhook signature did not verify.',
        code: 'WEBHOOK_BAD_SIGNATURE',
      });
    }

    const body = JSON.parse(rawBody) as RazorpayEvent;
    const entity = body.payload?.payment?.entity;

    return {
      eventId: headers['x-razorpay-event-id'] ?? `${body.event}:${entity?.id ?? 'unknown'}`,
      eventType: body.event,
      reference: entity?.order_id ?? null,
      outcome: outcomeFor(body.event),
      amount: entity ? (entity.amount / 100).toFixed(2) : null,
      failureReason: entity?.error_description ?? null,
    };
  }
}

interface RazorpayEvent {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id: string;
        order_id: string;
        amount: number;
        error_description?: string;
      };
    };
  };
}

function outcomeFor(event: string): WebhookVerdict['outcome'] {
  switch (event) {
    case 'payment.captured':
      return 'paid';
    case 'payment.failed':
      return 'failed';
    case 'refund.processed':
    case 'refund.created':
      return 'refunded';
    default:
      // Razorpay sends many events. Anything not understood is recorded and
      // ignored rather than guessed at.
      return 'ignored';
  }
}
