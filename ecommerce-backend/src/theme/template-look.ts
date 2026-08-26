import { ALLOWED_FONTS, HOMEPAGE_SECTIONS } from './dto/theme.dto';
import { BACKGROUND_PRESETS, LOGO_SIZES } from './backgrounds';

/**
 * Reads a template's stored `defaultTheme` and `layoutConfig` back out, keeping
 * only values the storefront can safely render.
 *
 * Both columns are `Json`, so what a row holds is whatever the validator
 * accepted the day it was written. Rows outlive allowlists: a font removed from
 * `ALLOWED_FONTS`, or a homepage section the storefront no longer knows how to
 * render, stays in the database until something reads it. Every path that
 * adopts a template goes through here — provisioning a new store, the seed, and
 * a shopkeeper switching an existing store from Appearance — so all three
 * interpret the same row the same way.
 *
 * The font list is the reason this exists at all and not just tidiness: the
 * storefront requests fonts from Google Fonts *by name*, so an unrecognised
 * value becomes an arbitrary request URL on every store that adopts it.
 *
 * A field that fails its check is dropped, not defaulted. The caller applies
 * only the keys present in the result, so dropping one leaves whatever the
 * store already had — which is a better outcome than overwriting a real colour
 * with an invented one.
 */

export interface TemplateLook {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  bodyFont?: string;
  headingFont?: string;
  /** Named page background. Part of the look, so a template carries it. */
  background?: string;
  /** Header logo height that suits the template's proportions. */
  logoSize?: string;
  homepageLayout?: string[];
}

const COLOUR_KEYS = ['primaryColor', 'secondaryColor', 'accentColor'] as const;
const FONT_KEYS = ['bodyFont', 'headingFont'] as const;

/**
 * Named-value fields, each with the allowlist it has to belong to.
 *
 * Filtered on read for the same reason as fonts: a template row can outlive a
 * preset being renamed, and a background the storefront cannot draw leaves a
 * page with no surface colour at all.
 */
const ENUM_KEYS = [
  ['background', BACKGROUND_PRESETS],
  ['logoSize', LOGO_SIZES],
] as const;

/**
 * `#abc`, `#aabbcc` and `#aabbccdd`. Lengths in between are not colours, so
 * `/^#[0-9a-f]{3,8}$/` would let `#abcde` through — a value CSS ignores, which
 * would leave a storefront element with no colour at all rather than a wrong
 * one, and no error anywhere to explain it.
 */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function templateLook(
  defaultTheme: unknown,
  layoutConfig: unknown,
): TemplateLook {
  const theme = asRecord(defaultTheme);
  const layout = asRecord(layoutConfig);
  const look: TemplateLook = {};

  for (const key of COLOUR_KEYS) {
    const value = theme[key];
    if (typeof value === 'string' && HEX.test(value.trim())) look[key] = value.trim();
  }

  for (const key of FONT_KEYS) {
    const value = theme[key];
    if (typeof value === 'string' && (ALLOWED_FONTS as readonly string[]).includes(value)) {
      look[key] = value;
    }
  }

  for (const [key, allowed] of ENUM_KEYS) {
    const value = theme[key];
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
      look[key] = value;
    }
  }

  const sections = layout.sections;
  if (Array.isArray(sections)) {
    // Deduplicated, because the same section twice would render twice. Order is
    // preserved — the array *is* the homepage order, so sorting it would
    // silently rearrange the page.
    const seen = new Set<string>();
    const kept = sections.filter(
      (s): s is string =>
        typeof s === 'string' &&
        (HOMEPAGE_SECTIONS as readonly string[]).includes(s) &&
        !seen.has(s) &&
        (seen.add(s), true),
    );

    // An empty result is not applied. A template whose sections were all
    // rejected describes no layout, and replacing a working homepage with a
    // blank one is worse than leaving it alone.
    if (kept.length > 0) look.homepageLayout = kept;
  }

  return look;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
