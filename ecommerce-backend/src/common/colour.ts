/**
 * Colour maths shared by anything that has to put a tenant's own hex somewhere
 * a person will read.
 *
 * Lifted out of the email theme when the invoice became the third consumer.
 * Two copies of a contrast calculation are two thresholds that can drift, and
 * the one that drifts looser is the one that ships an unreadable label.
 */
import { BRAND_DEFAULTS } from '../theme/brand-defaults';

/** The fallback whenever a stored value is not a usable colour. */
export const DEFAULT_BRAND = BRAND_DEFAULTS.PRIMARY;

/** Ink dark enough to sit on a pale fill. Matches the email and admin scales. */
const INK_STRONG = '#17150F';

/**
 * A six-digit hex, or the platform default.
 *
 * Six digits exactly, and not the looser `{3,8}`: a 3- or 4-digit hex is
 * unreliable in an Outlook `bgcolor` attribute and in a VML `fillcolor`, and an
 * 8-digit one carries an alpha channel that no mail client supports — it would
 * render as a silent transparency bug rather than as an error.
 *
 * This is the structural half of the CSS-injection defence. The colour reaches
 * three places that `escapeHtml` cannot make safe — a `bgcolor` attribute, an
 * inline `background-color`, and a VML `fillcolor` — so it is *validated*
 * rather than escaped. Loosen this and the hole reopens.
 */
export function safeHex(input?: string | null): string {
  const value = (input ?? '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : DEFAULT_BRAND;
}

/** Relative luminance, per WCAG 2.1. */
function luminance(hex: string): number {
  const channel = (start: number): number => {
    const v = parseInt(hex.slice(start, start + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Contrast ratio between two six-digit hex colours. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * The ink to set on a tenant's colour.
 *
 * Computed rather than assumed white. A forest-green store gets white type and
 * a pale-pink one gets near-black, automatically — which is the whole reason a
 * band filled with an arbitrary tenant hex is safe to put type on at all.
 */
export function inkOn(fill: string): string {
  return contrast(fill, '#FFFFFF') >= contrast(fill, INK_STRONG)
    ? '#FFFFFF'
    : INK_STRONG;
}

/**
 * The button fill: the tenant's colour, darkened until white type sits legibly
 * on it.
 *
 * Darkened rather than swapped for black, for a reason that is not obvious. A
 * near-black fill is exactly the pair Gmail's forced inversion mangles — it
 * flips the fill to near-white and may or may not flip the label with it, so
 * half the time a white-label store ships an invisible call to action. A
 * saturated mid-tone is what the heuristics leave alone. Stepping the lightness
 * down keeps the button recognisably the store's colour while getting it into
 * that band.
 */
export function buttonFill(brand: string): string {
  let fill = safeHex(brand);

  for (let step = 0; step < 24 && contrast(fill, '#FFFFFF') < 4.5; step += 1) {
    fill = darken(fill, 0.06);
  }

  // A colour so pale that twenty-four steps did not reach 4.5:1 is not a button
  // fill; ink is. Rare, and better than an unreadable label.
  return contrast(fill, '#FFFFFF') >= 4.5 ? fill : INK_STRONG;
}

/**
 * A hairline a shade darker than the band it sits under.
 *
 * Unconditional. On a saturated brand it reads as a deliberate shadow line; on
 * a near-white brand it is the only thing separating the band from the card, and
 * without it such a store's header simply vanishes.
 */
export function edgeOf(brand: string): string {
  return darken(safeHex(brand), 0.15);
}


/**
 * Two colours blended, for a tint that belongs to the brand rather than to a
 * grey ramp. `amount` is how much of `b` ends up in the result.
 */
export function mix(a: string, b: string, amount: number): string {
  const from = safeHex(a);
  const to = safeHex(b);
  const t = Math.min(1, Math.max(0, amount));

  const channel = (start: number): string => {
    const x = parseInt(from.slice(start, start + 2), 16);
    const y = parseInt(to.slice(start, start + 2), 16);
    return Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0');
  };

  return `#${channel(1)}${channel(3)}${channel(5)}`.toUpperCase();
}

/** The same channel-wise darkening the button fill steps with, exported. */
export function darken(hex: string, amount: number): string {
  const channel = (start: number): string => {
    const v = parseInt(safeHex(hex).slice(start, start + 2), 16);
    return Math.max(0, Math.round(v * (1 - amount)))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`.toUpperCase();
}
