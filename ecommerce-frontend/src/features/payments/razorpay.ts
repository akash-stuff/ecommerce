/**
 * Razorpay Checkout, loaded on demand.
 *
 * The script is fetched the first time online payment is actually chosen, not on
 * every page load: most visitors never reach checkout, and a third-party script
 * on the product page is a request that watches them for no benefit.
 *
 * Nothing secret passes through here. The key id is publishable by design, and
 * the gateway order was created server-side against the store's own account —
 * the browser only opens a widget for an amount the server already fixed.
 */

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

/** What the API's `initiate` call hands back for Razorpay. */
export interface RazorpayIntent {
  provider: 'RAZORPAY';
  keyId: string;
  razorpayOrderId: string;
  /** Already in paise, straight from the gateway. */
  amount: number;
  currency: string;
  orderNumber: string;
}

/**
 * The success payload, passed to the API verbatim for signature checking.
 *
 * The index signature is what lets it be forwarded as an opaque string map —
 * the server names these fields, not us, so nothing here should have to change
 * when the gateway adds one.
 */
export interface RazorpayReturn extends Record<string, string> {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpayReturn) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open(): void;
  on(event: string, handler: (payload: unknown) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;

/**
 * Injects the script once and resolves when it is usable.
 *
 * The promise is cached rather than the boolean, so two near-simultaneous calls
 * wait on one download instead of racing to add two script tags.
 */
export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Cleared so a later attempt can retry — a blocked script on one page load
      // should not permanently disable online payment for the session.
      loading = null;
      script.remove();
      reject(new Error('Could not load the payment window. Check your connection and retry.'));
    };
    document.head.appendChild(script);
  });

  return loading;
}

export type RazorpayOutcome =
  | { status: 'paid'; result: RazorpayReturn }
  | { status: 'dismissed' }
  | { status: 'failed'; reason: string };

/**
 * Opens the widget and resolves with what happened.
 *
 * Dismissal is a normal outcome, not an error: the order already exists and is
 * payable again, so the caller sends the shopper to it rather than losing the
 * cart they just checked out.
 */
export async function payWithRazorpay(input: {
  intent: RazorpayIntent;
  storeName: string;
  brandColor?: string;
  customer?: { name?: string; email?: string; phone?: string };
}): Promise<RazorpayOutcome> {
  await loadRazorpay();

  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error('The payment window is unavailable. Try again.');

  return new Promise<RazorpayOutcome>((resolve) => {
    // Guards against a widget that fires both handler and ondismiss, which
    // would otherwise resolve twice and let the caller navigate twice.
    let settled = false;
    const settle = (outcome: RazorpayOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const instance = new Razorpay({
      key: input.intent.keyId,
      amount: input.intent.amount,
      currency: input.intent.currency,
      order_id: input.intent.razorpayOrderId,
      name: input.storeName,
      description: `Order ${input.intent.orderNumber}`,
      prefill: {
        name: input.customer?.name,
        email: input.customer?.email,
        contact: input.customer?.phone,
      },
      theme: { color: input.brandColor },
      handler: (result) => settle({ status: 'paid', result }),
      modal: { ondismiss: () => settle({ status: 'dismissed' }) },
    });

    instance.on('payment.failed', (payload) => {
      const reason =
        (payload as { error?: { description?: string } })?.error?.description ??
        'The payment was declined.';
      settle({ status: 'failed', reason });
    });

    instance.open();
  });
}
