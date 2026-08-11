/**
 * What the platform needs from any payment provider.
 *
 * Orders and checkout depend on this interface, never on a provider SDK, so
 * adding Razorpay or Stripe later means adding a class here and registering it —
 * not touching the checkout transaction.
 */

export interface PaymentIntent {
  /** The provider's own id for the attempt, stored as Payment.providerRef. */
  reference: string;
  /** Anything the browser needs to continue: a gateway order id, a redirect. */
  clientPayload: Record<string, unknown>;
}

export interface WebhookVerdict {
  /** Provider-unique event id, used to make replays harmless. */
  eventId: string;
  eventType: string;
  /** Which payment this concerns, matched on Payment.providerRef. */
  reference: string | null;
  outcome: 'paid' | 'failed' | 'refunded' | 'ignored';
  amount: string | null;
  failureReason: string | null;
}

export interface PaymentProvider {
  readonly name: string;

  /** True when the store can actually use it — credentials present, etc. */
  isConfigured(): boolean;

  createIntent(input: {
    orderNumber: string;
    amount: string;
    currency: string;
    customerEmail: string;
  }): Promise<PaymentIntent>;

  /**
   * Verifies the signature and normalises the payload. Throwing here must mean
   * "this did not come from the provider", because the caller treats a verdict
   * as trustworthy.
   */
  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): WebhookVerdict;
}
