import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  CredentialField,
  PaymentIntent,
  PaymentProvider,
  WebhookVerdict,
} from '../payment-provider';

/**
 * Cash on delivery. There is no gateway, so the money is confirmed by a human
 * marking it collected — which is exactly what happens in the real world.
 *
 * It is a full provider rather than a special case in checkout, so the order
 * flow has one shape whether or not a gateway is involved.
 *
 * `isConfigured()` returns true because there is nothing to configure — but
 * that is not the same as "always offered". Whether a store accepts cash is a
 * business decision, held in `PaymentGateway.isEnabled`, and the service checks
 * that separately. Conflating the two is how COD ends up un-switch-off-able for
 * a store that only ships prepaid.
 */
@Injectable()
export class CodProvider implements PaymentProvider {
  readonly name = 'COD';

  /** Nothing to collect: cash needs no credentials. */
  readonly credentialFields: CredentialField[] = [];

  isConfigured(): boolean {
    return true;
  }

  async createIntent(input: { orderNumber: string }): Promise<PaymentIntent> {
    return {
      reference: `cod_${input.orderNumber}_${randomBytes(4).toString('hex')}`,
      clientPayload: { collectOnDelivery: true },
    };
  }

  /** COD has no webhooks, so there is no reference to find in one. */
  referenceFromUnverifiedBody(): string | null {
    return null;
  }

  /** Anything arriving here did not come from a provider. */
  verifyWebhook(): WebhookVerdict {
    throw new Error('COD does not send webhooks');
  }
}
