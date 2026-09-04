/**
 * The one loading indicator.
 *
 * Before this there were three: a bare "Loading…" in grey text for every lazy
 * route, a two-tone bordered circle for the storefront's first paint, and
 * lucide's `Loader2` at five different sizes inside buttons. Three shapes for
 * one meaning, and the most visible of them was not a shape at all.
 *
 * ## The two tones
 *
 * `green` is for a spinner standing on its own — a page, a panel, an upload
 * overlay — where it is the only thing on screen and can be the light green it
 * wants to be.
 *
 * `current` inherits `color` from whatever contains it, and is for a spinner
 * inside a button. A filled brand button has white type on it, and a green
 * spinner there is a green mark on a coloured field that either vanishes or
 * clashes depending on the tenant's palette. Inheriting means it is always
 * exactly as legible as the label beside it.
 */
export function Spinner({
  size = 20,
  tone = 'green',
  className = '',
  label,
}: {
  /** Pixels. The stroke scales with it, so small sizes stay fine rather than chunky. */
  size?: number;
  tone?: 'green' | 'current';
  className?: string;
  /**
   * Announced to a screen reader. Give one whenever the spinner is the only
   * thing saying the page is busy; omit it inside a button that already has a
   * label of its own, so the two are not read out as separate things.
   */
  label?: string;
}) {
  const green = tone === 'green';

  return (
    <span className={`inline-flex shrink-0 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        className="spinner-rotate"
        // Decorative: the text alternative is the `label` span below, so the
        // graphic itself must not also be announced.
        aria-hidden="true"
        focusable="false"
      >
        {/*
          The track. Without it the arc is a fragment floating in space and the
          spinner has no size until it happens to sweep past — the ring is what
          tells the eye how big the thing it is waiting for is.
        */}
        <circle
          cx="16"
          cy="16"
          r="14"
          strokeWidth="3"
          className={green ? 'stroke-leaf-100' : 'stroke-current opacity-25'}
        />
        <circle
          cx="16"
          cy="16"
          r="14"
          strokeWidth="3"
          // Rounded, because a flat cap on a 3px stroke reads as a chipped edge
          // at the sizes this is used at.
          strokeLinecap="round"
          className={`spinner-arc ${green ? 'stroke-leaf-500' : 'stroke-current'}`}
        />
      </svg>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}

/**
 * A spinner with room around it, for when a whole page or panel is waiting.
 *
 * The minimum height is the point: dropping a 24px spinner into an empty
 * container makes the layout jump when the real content arrives. Reserving a
 * screenful means the page settles once.
 */
export function LoadingPage({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner size={28} label={label} />
    </div>
  );
}
