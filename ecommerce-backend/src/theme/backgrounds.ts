/**
 * The page backgrounds a store may choose from.
 *
 * An allowlist of *names*, not CSS. The storefront owns what each one renders
 * as, so the two ends have to agree on the vocabulary and nothing more — the
 * same arrangement as `ALLOWED_FONTS`. Letting a tenant store CSS here instead
 * would put arbitrary declarations on every page of their storefront, which is
 * what `css-sanitiser` exists to prevent for the one field that does allow it.
 *
 * Every preset is drawn from the store's own brand colours at render time, so
 * "Aurora" on a jeweller's site and on a grocer's are recognisably the same
 * texture in two different palettes. That is the point: a white-label platform
 * cannot ship backgrounds in fixed colours without every store looking like the
 * platform rather than like itself.
 */
export const BACKGROUND_PRESETS = [
  /** Flat white. What a store gets if it never opens the setting. */
  'plain',
  /** Barely-there wash of the brand colour from the top. */
  'wash',
  /** Soft off-white paper tone. Warm, and kind to product photography. */
  'paper',
  /** Two brand-tinted radial glows, top-left and bottom-right. */
  'aurora',
  /** Fine dotted grid in the brand colour at low opacity. */
  'dots',
  /** Thin diagonal lines. Reads as texture rather than as pattern. */
  'lines',
  /** Concentric brand-tinted rings, strongest behind the hero. */
  'halo',
  /** Near-black surface with light type. For jewellery and luxury. */
  'midnight',
] as const;

export type BackgroundPreset = (typeof BACKGROUND_PRESETS)[number];

export const DEFAULT_BACKGROUND: BackgroundPreset = 'plain';

/**
 * How a custom background image is laid out.
 *
 * `cover` for a photograph, `tile` for a seamless texture. Kept separate from
 * the preset list because it applies to an uploaded image, not to a named
 * design, and the two are independent choices.
 */
export const BACKGROUND_FITS = ['cover', 'tile'] as const;
export type BackgroundFit = (typeof BACKGROUND_FITS)[number];

/**
 * Logo heights the header offers.
 *
 * A single fixed height cannot suit every logo: a square mark and a long
 * wordmark at the same height look nothing alike, and one of them always looks
 * wrong. Three named sizes let a shopkeeper pick without being handed a pixel
 * value to guess at.
 */
export const LOGO_SIZES = ['sm', 'md', 'lg'] as const;
export type LogoSize = (typeof LOGO_SIZES)[number];

export const DEFAULT_LOGO_SIZE: LogoSize = 'md';
