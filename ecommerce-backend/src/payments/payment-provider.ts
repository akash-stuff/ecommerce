/**
 * What the platform needs from any payment provider.
 *
 * Orders and checkout depend on this interface, never on a provider SDK, so
 * adding Stripe or PayPal later means adding a class here and registering it —
 * not touching the checkout transaction.
 *
 * Credentials are *passed in* rather than read from the environment. On a
 * white-label platform the gateway account belongs to the tenant, so a provider
 * that reached for `ConfigService` would settle every store's money into one
 * merchant account — the platform's. Making credentials an argument is what
 * makes that mistake impossible to write.
 */

/** One store's connection to one gateway, already decrypted. */
export interface GatewayCredentials {
  /** Publishable identifier sent to the browser, e.g. a Razorpay key id. */
  publicKey: string | null;
  /** Decrypted secrets by field name. Empty for a provider that needs none. */
  secrets: Record<string, string>;
}

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

  /**
   * Fields a store has to supply, in the order the admin should ask for them.
   * The admin form is generated from this, so adding a provider does not mean
   * writing a second copy of its field list in the frontend.
   */
  readonly credentialFields: CredentialField[];

  /** True when this store's credentials are complete enough to transact. */
  isConfigured(credentials: GatewayCredentials | null): boolean;

  createIntent(
    input: {
      orderNumber: string;
      amount: string;
      currency: string;
      customerEmail: string;
    },
    credentials: GatewayCredentials | null,
  ): Promise<PaymentIntent>;

  /**
   * Verifies the signature and normalises the payload. Throwing here must mean
   * "this did not come from the provider", because the caller treats a verdict
   * as trustworthy.
   */
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>,
    credentials: GatewayCredentials | null,
  ): WebhookVerdict;

  /**
   * Verifies what the gateway's browser widget hands back on success.
   *
   * Distinct from `verifyWebhook`: this is the *shopper's* browser reporting a
   * result, so it is attacker-controlled and only worth anything because it
   * carries a signature made with the store's secret. It exists because the
   * webhook can be seconds or minutes late — or unreachable from a laptop — and
   * a confirmation page that says "unpaid" straight after a successful payment
   * is how a shopper decides to pay twice.
   *
   * The webhook remains the source of truth; both paths converge on the same
   * apply step, which is idempotent.
   *
   * Undefined for a provider with no browser step.
   */
  verifyReturn?(
    payload: Record<string, string>,
    credentials: GatewayCredentials | null,
  ): { reference: string; paymentId: string };

  /**
   * Pulls the gateway's own reference out of an *unverified* body, so the
   * tenant — and therefore which secret to verify against — can be found.
   *
   * Reading before verifying is only safe because nothing here is believed: the
   * value is used to look up a row, and the signature check that follows uses
   * that row's secret. A wrong or hostile reference produces a failed
   * signature, not a wrong outcome.
   *
   * Null for a provider that has no webhooks.
   */
  referenceFromUnverifiedBody(rawBody: string): string | null;
}

/** One credential the admin form asks for. */
export interface CredentialField {
  /** Key within `secrets`, or the literal 'publicKey'. */
  name: string;
  label: string;
  /** False for values published to the browser anyway, e.g. a key id. */
  secret: boolean;
  /** Whether the provider can transact without it. */
  required: boolean;
  hint?: string;
}
