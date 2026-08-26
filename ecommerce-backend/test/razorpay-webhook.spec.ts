import { createHmac } from 'node:crypto';
import { RazorpayProvider } from '../src/payments/providers/razorpay.provider';
import type { GatewayCredentials } from '../src/payments/payment-provider';

const SECRET = 'whsec_test_value';

const provider = new RazorpayProvider();

/**
 * One store's connection. Credentials are an argument rather than environment,
 * because on a white-label platform each store connects its own Razorpay
 * account — see the note on PaymentProvider.
 */
const creds = (over: Partial<GatewayCredentials> = {}): GatewayCredentials => ({
  publicKey: 'rzp_test_key',
  secrets: { keySecret: 'secret', webhookSecret: SECRET },
  ...over,
});

const sign = (body: string, secret = SECRET) =>
  createHmac('sha256', secret).update(body).digest('hex');

const captured = JSON.stringify({
  event: 'payment.captured',
  payload: {
    payment: {
      entity: { id: 'pay_123', order_id: 'order_abc', amount: 141850 },
    },
  },
});

describe('Razorpay webhook verification', () => {
  it('accepts a correctly signed payload', () => {
    const verdict = provider.verifyWebhook(
      captured,
      { 'x-razorpay-signature': sign(captured), 'x-razorpay-event-id': 'evt_1' },
      creds(),
    );

    expect(verdict.outcome).toBe('paid');
    expect(verdict.reference).toBe('order_abc');
    expect(verdict.eventId).toBe('evt_1');
  });

  /** Amounts arrive in paise. Rupees is what the order is denominated in. */
  it('converts paise to the order currency unit', () => {
    const verdict = provider.verifyWebhook(
      captured,
      { 'x-razorpay-signature': sign(captured) },
      creds(),
    );
    expect(verdict.amount).toBe('1418.50');
  });

  it('rejects a payload signed with the wrong secret', () => {
    expect(() =>
      provider.verifyWebhook(
        captured,
        { 'x-razorpay-signature': sign(captured, 'attacker-secret') },
        creds(),
      ),
    ).toThrow(/did not verify/);
  });

  /**
   * The property that makes per-store gateways safe. Each store holds its own
   * webhook secret, so a payload legitimately signed for one store must not
   * verify against another's — otherwise any merchant on the platform could
   * mark another merchant's orders paid.
   */
  it("does not verify one store's payload against another store's secret", () => {
    const signedForStoreA = sign(captured, 'store-a-webhook-secret');

    expect(() =>
      provider.verifyWebhook(
        captured,
        { 'x-razorpay-signature': signedForStoreA },
        creds({ secrets: { keySecret: 'b', webhookSecret: 'store-b-webhook-secret' } }),
      ),
    ).toThrow(/did not verify/);
  });

  /**
   * The signature covers exact bytes. A body altered after signing — the attack
   * this check exists for — must fail even though the signature is well-formed.
   */
  it('rejects a tampered amount', () => {
    const signature = sign(captured);
    const tampered = captured.replace('141850', '1');

    expect(() =>
      provider.verifyWebhook(tampered, { 'x-razorpay-signature': signature }, creds()),
    ).toThrow(/did not verify/);
  });

  it('rejects an unsigned request', () => {
    expect(() => provider.verifyWebhook(captured, {}, creds())).toThrow(/Unsigned/);
  });

  it('refuses to verify when the store has stored no webhook secret', () => {
    expect(() =>
      provider.verifyWebhook(
        captured,
        { 'x-razorpay-signature': sign(captured) },
        creds({ secrets: { keySecret: 'secret' } }),
      ),
    ).toThrow(/Unsigned/);
  });

  it('refuses to verify when the store has no connection at all', () => {
    expect(() =>
      provider.verifyWebhook(captured, { 'x-razorpay-signature': sign(captured) }, null),
    ).toThrow(/Unsigned/);
  });

  it('maps a failure event and carries the reason', () => {
    const body = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_9',
            order_id: 'order_z',
            amount: 500,
            error_description: 'Card declined',
          },
        },
      },
    });

    const verdict = provider.verifyWebhook(
      body,
      { 'x-razorpay-signature': sign(body) },
      creds(),
    );

    expect(verdict.outcome).toBe('failed');
    expect(verdict.failureReason).toBe('Card declined');
  });

  it('ignores event types it does not understand rather than guessing', () => {
    const body = JSON.stringify({ event: 'subscription.charged', payload: {} });
    const verdict = provider.verifyWebhook(
      body,
      { 'x-razorpay-signature': sign(body) },
      creds(),
    );

    expect(verdict.outcome).toBe('ignored');
  });
});

/**
 * Finding the store before the signature can be checked.
 *
 * The reference is read from an unverified body, so the only thing it may be
 * used for is looking up which store's secret to verify against. It must
 * therefore never throw on hostile input — an exception here would be a way to
 * crash the webhook endpoint with a malformed POST.
 */
describe('Razorpay tenant attribution', () => {
  it('finds the gateway order id in an unverified body', () => {
    expect(provider.referenceFromUnverifiedBody(captured)).toBe('order_abc');
  });

  it('returns null rather than throwing on input that is not a Razorpay event', () => {
    for (const body of [
      '',
      'not json at all',
      '{',
      '[]',
      'null',
      '{"event":"payment.captured"}',
      '{"event":"x","payload":{}}',
      '{"payload":{"payment":{}}}',
      JSON.stringify({ payload: { payment: { entity: { id: 'pay_1' } } } }),
    ]) {
      expect(provider.referenceFromUnverifiedBody(body)).toBeNull();
    }
  });
});

describe('Razorpay configuration', () => {
  /**
   * Checkout asks this before offering a payment button. Reporting configured
   * on incomplete credentials would produce a button that fails at the gateway.
   */
  it('needs a key id and a key secret before it will transact', () => {
    expect(provider.isConfigured(creds())).toBe(true);
    expect(provider.isConfigured(null)).toBe(false);
    expect(provider.isConfigured(creds({ publicKey: null }))).toBe(false);
    expect(provider.isConfigured(creds({ publicKey: '' }))).toBe(false);
    expect(provider.isConfigured(creds({ secrets: {} }))).toBe(false);
    expect(provider.isConfigured(creds({ secrets: { webhookSecret: SECRET } }))).toBe(false);
  });

  /**
   * A store can transact before it has set up webhooks — Razorpay accepts the
   * payment either way. It just cannot be *told* about the outcome, which is
   * why the admin marks the field required.
   */
  it('will transact without a webhook secret, since capture still succeeds', () => {
    expect(provider.isConfigured(creds({ secrets: { keySecret: 'secret' } }))).toBe(true);
  });

  it('asks for exactly the three fields Razorpay needs', () => {
    expect(provider.credentialFields.map((f) => f.name)).toEqual([
      'publicKey',
      'keySecret',
      'webhookSecret',
    ]);
    // The key id is published to the browser to open the checkout widget, so
    // masking it in the admin would imply a secrecy it does not have.
    expect(provider.credentialFields.find((f) => f.name === 'publicKey')?.secret).toBe(false);
    expect(provider.credentialFields.filter((f) => f.secret).map((f) => f.name)).toEqual([
      'keySecret',
      'webhookSecret',
    ]);
  });
});

/**
 * The browser's own report of a successful payment.
 *
 * Signed with the *key secret*, over `order_id|payment_id` — a different secret
 * and a different message from the webhook. Mixing the two up produces a check
 * that never passes, so both are pinned here.
 */
describe('Razorpay browser return', () => {
  const signReturn = (orderId: string, paymentId: string, secret = 'secret') =>
    createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

  const payload = (over: Record<string, string> = {}) => ({
    razorpay_order_id: 'order_abc',
    razorpay_payment_id: 'pay_123',
    razorpay_signature: signReturn('order_abc', 'pay_123'),
    ...over,
  });

  it('accepts a correctly signed return and reports what it refers to', () => {
    expect(provider.verifyReturn(payload(), creds())).toEqual({
      reference: 'order_abc',
      paymentId: 'pay_123',
    });
  });

  it('is signed with the key secret, not the webhook secret', () => {
    // The mistake worth a test: signing with the webhook secret must not pass.
    expect(() =>
      provider.verifyReturn(
        payload({ razorpay_signature: signReturn('order_abc', 'pay_123', SECRET) }),
        creds(),
      ),
    ).toThrow(/did not verify/);
  });

  it('rejects a signature made with any other secret', () => {
    expect(() =>
      provider.verifyReturn(
        payload({ razorpay_signature: signReturn('order_abc', 'pay_123', 'guess') }),
        creds(),
      ),
    ).toThrow(/did not verify/);
  });

  /**
   * The signature covers both ids together, so a signature lifted from one
   * payment cannot be re-presented for another — which is what stops a shopper
   * replaying their own successful payment against a second order.
   */
  it('rejects a signature bound to a different payment or order', () => {
    expect(() =>
      provider.verifyReturn(payload({ razorpay_payment_id: 'pay_999' }), creds()),
    ).toThrow(/did not verify/);

    expect(() =>
      provider.verifyReturn(payload({ razorpay_order_id: 'order_other' }), creds()),
    ).toThrow(/did not verify/);
  });

  it('rejects an incomplete return rather than guessing', () => {
    for (const missing of [
      'razorpay_order_id',
      'razorpay_payment_id',
      'razorpay_signature',
    ]) {
      const p = payload();
      delete (p as Record<string, string>)[missing];
      expect(() => provider.verifyReturn(p, creds())).toThrow(/incomplete/i);
    }
  });

  it('refuses when the store has stored no key secret', () => {
    expect(() => provider.verifyReturn(payload(), creds({ secrets: {} }))).toThrow(
      /incomplete/i,
    );
    expect(() => provider.verifyReturn(payload(), null)).toThrow(/incomplete/i);
  });

  it('does not fall over on a signature that is not hex', () => {
    expect(() =>
      provider.verifyReturn(payload({ razorpay_signature: 'not-hex-at-all' }), creds()),
    ).toThrow(/did not verify/);
  });
});
