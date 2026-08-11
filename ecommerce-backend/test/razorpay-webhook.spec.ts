import { createHmac } from 'node:crypto';
import { RazorpayProvider } from '../src/payments/providers/razorpay.provider';

const SECRET = 'whsec_test_value';

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as never;

const provider = (over: Record<string, string> = {}) =>
  new RazorpayProvider(
    config({
      'razorpay.keyId': 'rzp_test_key',
      'razorpay.keySecret': 'secret',
      'razorpay.webhookSecret': SECRET,
      ...over,
    }),
  );

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
    const verdict = provider().verifyWebhook(captured, {
      'x-razorpay-signature': sign(captured),
      'x-razorpay-event-id': 'evt_1',
    });

    expect(verdict.outcome).toBe('paid');
    expect(verdict.reference).toBe('order_abc');
    expect(verdict.eventId).toBe('evt_1');
  });

  /** Amounts arrive in paise. Rupees is what the order is denominated in. */
  it('converts paise to the order currency unit', () => {
    const verdict = provider().verifyWebhook(captured, {
      'x-razorpay-signature': sign(captured),
    });
    expect(verdict.amount).toBe('1418.50');
  });

  it('rejects a payload signed with the wrong secret', () => {
    expect(() =>
      provider().verifyWebhook(captured, {
        'x-razorpay-signature': sign(captured, 'attacker-secret'),
      }),
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
      provider().verifyWebhook(tampered, { 'x-razorpay-signature': signature }),
    ).toThrow(/did not verify/);
  });

  it('rejects an unsigned request', () => {
    expect(() => provider().verifyWebhook(captured, {})).toThrow(/Unsigned/);
  });

  it('refuses to verify when no webhook secret is configured', () => {
    expect(() =>
      provider({ 'razorpay.webhookSecret': '' }).verifyWebhook(captured, {
        'x-razorpay-signature': sign(captured),
      }),
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

    const verdict = provider().verifyWebhook(body, {
      'x-razorpay-signature': sign(body),
    });

    expect(verdict.outcome).toBe('failed');
    expect(verdict.failureReason).toBe('Card declined');
  });

  it('ignores event types it does not understand rather than guessing', () => {
    const body = JSON.stringify({ event: 'subscription.charged', payload: {} });
    const verdict = provider().verifyWebhook(body, {
      'x-razorpay-signature': sign(body),
    });

    expect(verdict.outcome).toBe('ignored');
  });

  it('reports itself unconfigured without credentials, so checkout will not offer it', () => {
    expect(provider({ 'razorpay.keyId': '', 'razorpay.keySecret': '' }).isConfigured()).toBe(false);
    expect(provider().isConfigured()).toBe(true);
  });
});
