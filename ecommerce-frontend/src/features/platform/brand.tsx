import { useId } from 'react';

/**
 * The platform's own identity — deliberately not a tenant's.
 *
 * Everything under `bg-brand` reads CSS custom properties that ThemeProvider
 * writes per store, which is right for a storefront and wrong here: the
 * marketing page and the staff sign-in belong to the platform, and must look
 * the same whichever store was last loaded in that tab. So these use fixed
 * values rather than the brand tokens.
 */

/**
 * The mark's green, as a literal rather than a class or a token.
 *
 * Painted straight onto the SVG, so the logo renders correctly with no
 * stylesheet at all. That is not premature caution: this mark previously drew
 * itself in `text-white` on a `bg-leaf-600` tile, and any state where that one
 * background class is missing — a stale Tailwind build, a CSS chunk that failed
 * to load — turned the whole logo into white on white and it simply was not
 * there. A brand mark is the last thing on a page that should depend on the
 * theme layer having arrived.
 *
 * Matches `leaf-600` in tailwind.config.js. The two are read side by side often
 * enough that a drift would be noticed, and neither can be expressed in terms
 * of the other.
 */
export const MARK_GREEN = '#16A34A';

/**
 * A shopping bag with a smile cut out of it.
 *
 * One solid silhouette, green by default and on any ground. Callers that want
 * it to follow the surrounding text — a footer set in one colour, say — pass
 * `color="currentColor"` and take responsibility for the contrast themselves.
 *
 * The smile is *removed* rather than drawn — a second path in a white-on-black
 * mask — so what shows through it is whatever is behind the mark. Painting it
 * white instead would put a white smile on a white sidebar, which is a logo
 * with a bite missing.
 *
 * `useId` gives the mask a document-unique name because the mark renders three
 * or four times on the marketing page, and `url(#…)` resolves to the *first*
 * matching id in the document. The colons React puts in its ids are stripped:
 * `url(#:r1:)` is not a valid reference and the mask is silently ignored, which
 * shows up as a bag with no smile at all.
 */
export function EverystoreMark({
  size = 26,
  color = MARK_GREEN,
}: {
  size?: number;
  /** `currentColor` to follow the surrounding text instead of painting green. */
  color?: string;
}) {
  const maskId = `bag-${useId().replace(/:/g, '')}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
        <rect x="0" y="0" width="32" height="32" fill="#fff" />
        <path
          d="M12.6 18C12.6 21.4 19.4 21.4 19.4 18"
          stroke="#000"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />
      </mask>

      {/* The handle, above the body so the two never overlap. */}
      <path
        d="M11.5 11V10a4.5 4.5 0 0 1 9 0v1"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <rect
        x="5.5"
        y="11"
        width="21"
        height="16.5"
        rx="4.5"
        fill={color}
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}

const LOCKUP_SIZES = {
  sm: { mark: 26, name: 'text-[0.95rem]', tagline: 'text-[9px]' },
  md: { mark: 34, name: 'text-xl', tagline: 'text-[10px]' },
} as const;

/**
 * The full lockup: the bag, the name set in two colours, and the line under it.
 *
 * One definition for every surface that shows the brand — the marketing page,
 * the sign-in screen, the store admin and the platform console. It used to live
 * privately in Landing.tsx, which is how the console ended up rendering
 * "Everystore" as one word in one colour while the front page rendered
 * "every" + "store": two lockups for one brand, and nothing to make them agree.
 *
 * `store` is coloured with `MARK_GREEN` inline rather than with a theme class,
 * for the same reason the mark is — see the note on that constant. The two
 * halves of a lockup must never disagree about whether the brand has a colour.
 */
export function Lockup({
  size = 'md',
  tagline = false,
  className = '',
}: {
  size?: keyof typeof LOCKUP_SIZES;
  /** The strapline under the name. Off in tight chrome, on where there is room. */
  tagline?: boolean;
  className?: string;
}) {
  const s = LOCKUP_SIZES[size];

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <EverystoreMark size={s.mark} />
      <span className="leading-none">
        <span
          className={`block font-display font-semibold tracking-tight text-ink-950 ${s.name}`}
        >
          every<span style={{ color: MARK_GREEN }}>store</span>
        </span>
        {tagline && (
          <span className={`mt-1 block font-medium tracking-wide text-ink-500 ${s.tagline}`}>
            {TAGLINE}
          </span>
        )}
      </span>
    </span>
  );
}

export const TAGLINE = 'Your Brand. Your Store. Your Way.';
