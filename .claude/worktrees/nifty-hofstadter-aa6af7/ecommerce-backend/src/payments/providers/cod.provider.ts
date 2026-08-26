import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { PaymentIntent, PaymentProvider, WebhookVerdict } from '../payment-provider';

/**
 * Cash on delivery. There is no gateway, so the money is confirmed by a human
 * marking it collected — which is exactly what happens in the real world.
 *
 * It is a full provider rather than a special case in checkout, so the order
 * flow has one shape whether or not a gateway is involved.
 */
@Injectable()
export class CodProvider implements PaymentProvider {
  readonly name = 'COD';

  isConfigured(): boolean {
    return true;
  }

  async createIntent(input: { orderNumber: string }): Promise<PaymentIntent> {
    return {
      reference: `cod_${input.orderNumber}_${randomBytes(4).toString('hex')}`,
      clientPayload: { collectOnDelivery: true },
    };
  }

  /** COD has no webhooks; anything arriving here did not come from a provider. */
  verifyWebhook(): WebhookVerdict {
    throw new Error('COD does not send webhooks');
  }
}
