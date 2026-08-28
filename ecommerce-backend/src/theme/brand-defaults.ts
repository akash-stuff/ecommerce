/**
 * The platform's default brand colours.
 *
 * Green leads, warm amber-orange supports. Every store can override both — that
 * is the point of a white-label platform — so these are the answer to "what
 * does a store look like before anyone has chosen", not a house style imposed
 * on tenants.
 *
 * Kept in one file because the same pair was previously written out in four
 * places (the Prisma column defaults, the store config fallback, the order
 * email fallback and the frontend's CSS custom properties) and they had already
 * drifted: a theme row created before a column default changed would disagree
 * with a theme row created after it.
 *
 * These values must stay in step with:
 *   - `Theme.primaryColor` / `secondaryColor` / `accentColor` @default in
 *     schema.prisma, which the database applies for rows this code never sees
 *   - `--brand-primary` / `--brand-secondary` in the frontend's index.css,
 *     which is the one-frame fallback before ThemeProvider writes the real values
 *
 * Contrast, since a colour that cannot be read is not a brand colour:
 *   PRIMARY on white and white on PRIMARY both clear 7:1, so it is safe for
 *   body text and for a filled button.
 *   SECONDARY is ~2:1 on white. It is deliberately only used for fills,
 *   gradients and accents — never for text — and anything that starts using it
 *   as a text colour needs a darker shade instead.
 */
export const BRAND_DEFAULTS = {
  /** Deep forest green. Buttons, links, headings. */
  PRIMARY: '#166534',
  /** Warm amber-orange. Badges, highlights, gradient partners. */
  SECONDARY: '#F5A524',
  /** Follows the primary unless a template says otherwise. */
  ACCENT: '#166534',
} as const;
