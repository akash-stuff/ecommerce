import { useEffect, useState } from 'react';

/**
 * The tick a payment app draws when money lands.
 *
 * Two strokes rather than an icon: the ring sweeps closed and the check draws
 * itself, which is what makes it read as *completing* rather than as a static
 * green blob appearing. `pathLength="1"` normalises both paths so the dash
 * animation is expressed in fractions and does not have to know their real
 * length in user units.
 */
export function SuccessTick({ size = 92 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 52 52"
      fill="none"
      aria-hidden="true"
      className="order-placed-tick"
    >
      <circle
        className="order-placed-ring"
        cx="26"
        cy="26"
        r="24"
        pathLength="1"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        className="order-placed-check"
        d="M15 27.5 L22.5 34.5 L37 19"
        pathLength="1"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Full-screen confirmation shown the moment an order is accepted.
 *
 * It exists because the honest signal that a payment worked used to be a route
 * change — the page simply became a different page, which reads as a navigation
 * rather than as *it went through*. A held beat with a drawn tick is the
 * convention every payment app uses for exactly that reason.
 *
 * `onDone` fires after the animation, and the overlay is deliberately not
 * dismissible: the order is already placed by this point, so there is nothing
 * to cancel and no decision to offer.
 */
export function OrderPlacedOverlay({
  amount,
  method,
  onDone,
  holdMs = 1700,
}: {
  amount: string;
  method: string;
  onDone: () => void;
  holdMs?: number;
}) {
  const [reduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    // Someone who has asked for less motion should not be made to sit through
    // it either — the hold is the animation.
    const timer = window.setTimeout(onDone, reduced ? 350 : holdMs);
    return () => window.clearTimeout(timer);
  }, [onDone, holdMs, reduced]);

  return (
    <div
      role="status"
      aria-live="polite"
      // Above the header and any open sheet. Fixed rather than absolute so a
      // scrolled checkout does not push it off screen.
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white px-6 text-center"
    >
      <span className="text-emerald-600">
        <SuccessTick />
      </span>

      <p className="order-placed-fade mt-6 font-display text-2xl tracking-tight text-ink-950">
        Order placed
      </p>
      <p className="order-placed-fade order-placed-fade-late mt-1.5 text-sm text-ink-500">
        {amount} · {method}
      </p>

      <span className="sr-only">Your order was placed successfully.</span>
    </div>
  );
}
