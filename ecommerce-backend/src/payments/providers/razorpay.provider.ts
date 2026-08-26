import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  CredentialField,
  GatewayCredentials,
  PaymentIntent,
  PaymentProvider,
  WebhookVerdict,
} from '../payment-provider';

/**
 * Razorpay, against the *store's own* merchant account.
 *
 * There is deliberately no `ConfigService` here. Credentials arrive per call
 * from the tenant's `PaymentGateway` row, because a white-label store's
 * settlements have to reach that store's bank account. A provider holding
 * platform-wide keys would quietly collect every tenant's revenue into one
 * account, and nothing in the checkout flow would look wrong.
 *
 * `isConfigured()` gates everything: with incomplete credentials the provider
 * reports itself unavailable and checkout refuses online payment rather than
 * pretending to accept one. An unconfigured gateway must fail visibly, not
 * simulate success.
 */
@Injectable()
export class RazorpayProvider implements PaymentProvider {
  readonly name = 'RAZORPAY';
  private readonly logger = new Logger(RazorpayProvider.name);

  readonly credentialFields: CredentialField[] = [
    {
      name: 'publicKey',
      label: 'Key ID',
      secret: false,
      required: true,
      hint: 'Starts with rzp_live_ or rzp_test_. Razorpay Dashboard → Account & Settings → API Keys.',
    },
    {
      name: 'keySecret',
      label: 'Key Secret',
      secret: true,
      required: true,
      hint: 'Shown once when the key pair is generated. Regenerate in Razorpay if you have lost it.',
    },
    {
      name: 'webhookSecret',
      label: 'Webhook Secret',
      secret: true,
      required: true,
      hint: 'The secret you type when adding the webhook in Razorpay. Without it, payment confirmations cannot be trusted and orders stay unpaid.',
    },
  ];

  isConfigured(credentials: GatewayCredentials | null): boolean {
    return Boolean(credentials?.publicKey && credentials.secrets.keySecret);
  }

  /**
   * Creates a Razorpay order. Amounts go over the wire in the smallest currency
   * unit, so rupees become paise — getting this wrong charges a hundredth or a
   * hundred times the intended amount.
   */
  async createIntent(
    input: { orderNumber: string; amount: string; currency: string },
    credentials: GatewayCredentials | null,
  ): Promise<PaymentIntent> {
    const keyId = credentials?.publicKey;
    const keySecret = credentials?.secrets.keySecret;

    // Unreachable through the service, which checks isConfigured() first. Kept
    // because a provider that transacts on empty credentials would fail against
    // Razorpay with an opaque 401 instead of saying what is wrong.
    if (!keyId || !keySecret) {
      throw new Error('Razorpay is not connected for this store.');
    }

    const paise = Math.round(Number.parseFloat(input.amount) * 100);
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

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

      /**
       * A typed refusal, not a bare Error.
       *
       * A plain throw becomes a 500 "something went wrong on our end", which is
       * both wrong and unhelpful: the store's credentials or Razorpay itself are
       * the problem, the shopper's order is already saved, and the useful thing
       * to say is that they can try again or pay another way. 401 and 400 from
       * the gateway mean the keys are wrong — worth a distinct code so the
       * shopkeeper's logs point at their own setup rather than at an outage.
       */
      const credentialProblem = response.status === 401 || response.status === 400;
      throw new ServiceUnavailableException({
        message: credentialProblem
          ? 'This store cannot take online payments at the moment. Your order is saved — try again shortly or choose another method.'
          : 'The payment provider did not respond. Your order is saved — try again in a moment.',
        code: credentialProblem ? 'GATEWAY_REJECTED_CREDENTIALS' : 'GATEWAY_UNAVAILABLE',
      });
    }

    const order = (await response.json()) as { id: string; amount: number };

    return {
      reference: order.id,
      // The key id is publishable by design; the secret never leaves the server.
      clientPayload: {
        provider: 'RAZORPAY',
        keyId,
        razorpayOrderId: order.id,
        amount: order.amount,
        currency: input.currency,
      },
    };
  }

  /**
   * The signature Razorpay Checkout returns to the browser on success.
   *
   * It is HMAC-SHA256 of `order_id|payment_id` under the key *secret* — not the
   * webhook secret. Two different secrets sign two different things here, and
   * using the wrong one is a verification that never passes.
   */
  verifyReturn(
    payload: Record<string, string>,
    credentials: GatewayCredentials | null,
  ): { reference: string; paymentId: string } {
    const keySecret = credentials?.secrets.keySecret;
    const orderId = payload.razorpay_order_id;
    const paymentId = payload.razorpay_payment_id;
    const signature = payload.razorpay_signature;

    if (!keySecret || !orderId || !paymentId || !signature) {
      throw new UnauthorizedException({
        message: 'Payment confirmation was incomplete.',
        code: 'PAYMENT_RETURN_INCOMPLETE',
      });
    }

    const expected = createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest();
    const received = Buffer.from(signature, 'hex');

    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new UnauthorizedException({
        message: 'Payment confirmation did not verify.',
        code: 'PAYMENT_RETURN_BAD_SIGNATURE',
      });
    }

    return { reference: orderId, paymentId };
  }

  /** The gateway order id, so the tenant can be found before verifying. */
  referenceFromUnverifiedBody(rawBody: string): string | null {
    try {
      const body = JSON.parse(rawBody) as RazorpayEvent;
      return body.payload?.payment?.entity?.order_id ?? null;
    } catch {
      // Unparseable bodies are not from Razorpay. Reported as "no reference"
      // rather than thrown, so the caller answers with one clear 401.
      return null;
    }
  }

  /**
   * HMAC-SHA256 over the exact bytes received, compared in constant time,
   * against *this store's* webhook secret.
   *
   * The raw body matters: re-serialising the parsed JSON changes key order and
   * whitespace, and the signature would never match.
   */
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>,
    credentials: GatewayCredentials | null,
  ): WebhookVerdict {
    const signature = headers['x-razorpay-signature'];
    const webhookSecret = credentials?.secrets.webhookSecret;

    if (!signature || !webhookSecret) {
      throw new UnauthorizedException({
        message: 'Unsigned webhook.',
        code: 'WEBHOOK_UNSIGNED',
      });
    }

    const expected = createHmac('sha256', webhookSecret).update(rawBody).digest();
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
