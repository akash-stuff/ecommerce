import { useEffect, useRef, useState, type ReactNode } from 'react';

/** True when this browser can animate and we are allowed to. */
function canAnimate(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof IntersectionObserver === 'undefined') return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Fades a block up as it scrolls into view.
 *
 * ## Visible first, hidden only on instruction
 *
 * The obvious way to write this is to render at `opacity: 0` and let an
 * observer reveal it. Do not: it makes an animation the only thing standing
 * between a shopper and the products, and if the observer never reports — a
 * backgrounded tab, a prerender, an embedded webview — the page is a column of
 * blank space where the catalogue should be. That is not a degraded animation,
 * it is a shop that sells nothing.
 *
 * So the block renders visible, and is hidden only once the observer has said,
 * in as many words, that it is off screen. Then it is revealed when it comes
 * back. If no callback ever arrives the page simply does not animate, which is
 * the correct thing to lose.
 *
 * The hide happens a frame or two after mount, but only ever to something the
 * observer has confirmed is outside the viewport — so there is nothing on
 * screen to flicker.
 *
 * ## It only plays once
 *
 * The observer disconnects on the reveal. Re-animating on the way back up means
 * a shopper scrolling to re-read something watches it fade in again, which
 * reads as a glitch rather than as polish.
 */
export function Reveal({
  children,
  /** Stagger within a row, in ms. Keep small; this delays real content. */
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /**
   * `null` until the observer has an opinion, and rendered visible while it is.
   * `false` means it told us the block is off screen; `true` means show it.
   */
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !canAnimate()) return;

    /**
     * Reports before the layout settles are ignored.
     *
     * A homepage assembles in stages: the category row renders nothing until its
     * query lands, and a grid's loading skeleton is one row where the real grid
     * is two. For those first moments the page is far shorter than it ends up,
     * so a block destined for halfway down genuinely is in the viewport — it
     * would be marked visible, the page would then grow underneath it, and it
     * would sit below the fold already faded in, having animated for nobody.
     */
    let settled = false;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!settled) return;

        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
          return;
        }

        // Confirmed off screen: safe to hide, because nobody is looking at it.
        setVisible(false);
      },
      // A negative bottom margin fires slightly before the block reaches the
      // viewport edge, so the fade completes as it arrives rather than starting
      // there.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.01 },
    );

    observer.observe(node);

    const settle = window.setTimeout(() => {
      settled = true;
      /**
       * Re-observing forces a fresh report against the finished layout. An
       * element whose intersection has not *changed* gives the observer nothing
       * new to say, so without this the settled measurement never happens.
       */
      observer.unobserve(node);
      observer.observe(node);
    }, 250);

    return () => {
      window.clearTimeout(settle);
      observer.disconnect();
    };
  }, []);

  const hidden = visible === false;

  return (
    <div
      ref={ref}
      className={`motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out ${
        hidden ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100'
      } ${className}`}
      /*
        Always set, not only while hidden. The delay has to be in effect for the
        transition *into* view — that is the one being staggered. Clearing it at
        the moment the opacity changes means the browser reads a delay of zero
        and the whole row arrives together.
      */
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
