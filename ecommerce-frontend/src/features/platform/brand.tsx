/**
 * The platform's own identity — deliberately not a tenant's.
 *
 * Everything under `bg-brand` reads CSS custom properties that ThemeProvider
 * writes per store, which is right for a storefront and wrong here: the
 * marketing page and the staff sign-in belong to the platform, and must look
 * the same whichever store was last loaded in that tab. So these use fixed
 * values rather than the brand tokens.
 */

/** Stacked squares: many stores, one platform. */
export function EverystoreMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="3" y="3" width="14" height="14" rx="4" fill="currentColor" opacity="0.32" />
      <rect x="7.5" y="7.5" width="14" height="14" rx="4" fill="currentColor" opacity="0.62" />
      <rect x="12" y="12" width="13" height="13" rx="4" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({
  className = '',
  markSize = 24,
}: {
  className?: string;
  markSize?: number;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <EverystoreMark size={markSize} />
      <span className="font-display text-[1.05rem] font-medium tracking-tight">Everystore</span>
    </span>
  );
}

export const TAGLINE = 'One platform. Every store its own.';
