import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen } from '@/test/render';
import { OrderPlacedOverlay, SuccessTick } from './OrderPlaced';

/** Lets the component read a `prefers-reduced-motion` answer we control. */
function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

describe('the order-placed confirmation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('says what was paid and how', () => {
    render(
      <OrderPlacedOverlay amount="₹2,242.00" method="Cash on delivery" onDone={vi.fn()} />,
    );
    expect(screen.getByText('Order placed')).toBeInTheDocument();
    expect(screen.getByText('₹2,242.00 · Cash on delivery')).toBeInTheDocument();
  });

  /**
   * The overlay owns the navigation that follows it. If this stopped firing the
   * shopper would be stranded on a success screen with no way forward and an
   * order they cannot see — so the callback is the part worth pinning.
   */
  it('hands back control once the beat is over', () => {
    const onDone = vi.fn();
    render(<OrderPlacedOverlay amount="₹10.00" method="Paid" onDone={onDone} holdMs={1700} />);

    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1699);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  /**
   * Someone who asked for less motion should not be made to sit through the
   * hold either — the animation *is* the wait, so removing one without the
   * other just leaves them staring at a static screen.
   */
  it('does not hold a reduced-motion viewer for the full animation', () => {
    setReducedMotion(true);
    const onDone = vi.fn();
    render(<OrderPlacedOverlay amount="₹10.00" method="Paid" onDone={onDone} holdMs={1700} />);

    vi.advanceTimersByTime(350);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('announces itself without stealing focus', () => {
    render(<OrderPlacedOverlay amount="₹10.00" method="Paid" onDone={vi.fn()} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('fires onDone once, not once per re-render', () => {
    const onDone = vi.fn();
    const { rerender } = render(
      <OrderPlacedOverlay amount="₹10.00" method="Paid" onDone={onDone} holdMs={500} />,
    );
    rerender(<OrderPlacedOverlay amount="₹10.00" method="Paid" onDone={onDone} holdMs={500} />);
    vi.advanceTimersByTime(2000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('the tick itself', () => {
  /**
   * `pathLength="1"` is what lets the CSS express the draw as a fraction. Lose
   * it and `stroke-dashoffset: 1` becomes one user unit of a ~150-unit path —
   * the mark renders complete and the animation silently does nothing.
   */
  it('normalises both strokes so the draw animation can address them', () => {
    const { container } = render(<SuccessTick />);
    const ring = container.querySelector('.order-placed-ring');
    const check = container.querySelector('.order-placed-check');

    expect(ring).toHaveAttribute('pathLength', '1');
    expect(check).toHaveAttribute('pathLength', '1');
  });

  it('is decorative, so it is hidden from assistive tech', () => {
    const { container } = render(<SuccessTick />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
