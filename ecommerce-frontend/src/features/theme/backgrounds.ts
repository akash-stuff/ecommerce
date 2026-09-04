/**
 * What each background preset actually looks like.
 *
 * The names are the contract with the API, which only ever stores a name — see
 * `theme/backgrounds.ts` on the backend. The CSS lives here because it is a
 * rendering decision, and keeping it out of the database is what stops a tenant
 * putting arbitrary declarations on every page of their storefront.
 *
 * Every preset is built from the store's own brand colours, so "Aurora" on a
 * jeweller's site and on a grocer's are the same texture in two different
 * palettes. A white-label platform cannot ship backgrounds in fixed colours
 * without every store ending up looking like the platform.
 */

export interface Surface {
  /** Applied to the page behind everything. */
  style: React.CSSProperties;
  /**
   * True when the surface is dark enough that body text has to invert. Drives a
   * class on the root rather than being guessed at per component.
   */
  dark: boolean;
}

/** `#rrggbb` to `r, g, b`, so a colour can be used at partial opacity. */
function channels(hex: string): string {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value.slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return '17, 24, 39';
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/**
 * An SVG pattern as a data URI.
 *
 * Inline rather than a file: the colour is the tenant's, so the asset cannot be
 * static, and a generated URI avoids a second request for something that is a
 * few hundred bytes of markup.
 */
function svgUri(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}")`;
}

export function surfaceFor(
  background: string,
  primary: string,
  secondary: string,
): Surface {
  const p = channels(primary);
  const s = channels(secondary);

  switch (background) {
    case 'wash':
      return {
        dark: false,
        style: {
          // Fixed, so the wash stays at the top of the viewport rather than
          // scrolling into the middle of the page.
          backgroundImage: `linear-gradient(180deg, rgba(${p}, 0.07) 0%, rgba(${p}, 0) 640px)`,
          backgroundColor: '#ffffff',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed',
        },
      };

    case 'paper':
      return {
        dark: false,
        style: {
          backgroundColor: '#FAF8F4',
          // A very faint fibre texture. Two offset dot grids read as paper
          // rather than as a pattern at this opacity.
          backgroundImage: svgUri(
            `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">
               <circle cx="7" cy="11" r="0.7" fill="rgba(${s}, 0.16)"/>
               <circle cx="27" cy="31" r="0.7" fill="rgba(${s}, 0.12)"/>
             </svg>`,
          ),
        },
      };

    case 'aurora':
      return {
        dark: false,
        style: {
          backgroundColor: '#ffffff',
          backgroundImage: [
            `radial-gradient(60rem 40rem at 8% -8%, rgba(${p}, 0.16), transparent 60%)`,
            `radial-gradient(48rem 36rem at 108% 12%, rgba(${s}, 0.18), transparent 62%)`,
          ].join(', '),
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed',
        },
      };

    case 'dots':
      return {
        dark: false,
        style: {
          backgroundColor: '#ffffff',
          backgroundImage: svgUri(
            `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
               <circle cx="2" cy="2" r="1.1" fill="rgba(${p}, 0.13)"/>
             </svg>`,
          ),
        },
      };

    case 'lines':
      return {
        dark: false,
        style: {
          backgroundColor: '#ffffff',
          // 45° hairlines. `repeating-linear-gradient` rather than an SVG so the
          // spacing stays exact at any device pixel ratio.
          backgroundImage:
            `repeating-linear-gradient(45deg, rgba(${p}, 0.055) 0 1px, transparent 1px 11px)`,
        },
      };

    case 'halo':
      return {
        dark: false,
        style: {
          backgroundColor: '#ffffff',
          backgroundImage: [
            `radial-gradient(38rem 38rem at 50% -10rem, rgba(${p}, 0.20), transparent 65%)`,
            `radial-gradient(64rem 64rem at 50% -18rem, rgba(${s}, 0.10), transparent 70%)`,
          ].join(', '),
          backgroundRepeat: 'no-repeat',
          // Not fixed: the halo belongs behind the hero, so it should scroll
          // away with it rather than follow the shopper down the page.
          backgroundAttachment: 'scroll',
        },
      };

    case 'midnight':
      return {
        dark: true,
        style: {
          backgroundColor: '#0B0B0D',
          backgroundImage: [
            `radial-gradient(52rem 40rem at 12% -6%, rgba(${p}, 0.30), transparent 62%)`,
            `radial-gradient(44rem 34rem at 104% 8%, rgba(${s}, 0.20), transparent 64%)`,
          ].join(', '),
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed',
        },
      };

    case 'plain':
    default:
      return { dark: false, style: { backgroundColor: '#ffffff' } };
  }
}

/**
 * A store's own uploaded image, which overrides the preset.
 *
 * `cover` for a photograph — fixed, so it behaves like a backdrop rather than a
 * very tall banner. `tile` for a seamless texture, which must repeat and must
 * not be stretched.
 */
export function surfaceForImage(url: string, fit: string): Surface {
  return {
    // Assumed dark: a photograph is usually busy enough that dark type on it is
    // unreadable, and the scrim the layout adds is what makes either work.
    dark: fit === 'cover',
    style:
      fit === 'tile'
        ? { backgroundImage: `url(${JSON.stringify(url)})`, backgroundRepeat: 'repeat' }
        : {
            backgroundImage: `url(${JSON.stringify(url)})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'fixed',
          },
  };
}

/**
 * Header logo heights. Tailwind classes, so they stay responsive.
 *
 * The header row is a `min-h`, not a fixed height, so `lg` is allowed to be
 * genuinely large: it grows the bar rather than being clipped by it. Before
 * that it could not be — the row was pinned to 80px, so every step above
 * roughly `h-14` rendered identically and picking "Large" appeared to do
 * nothing.
 *
 * Only `lg` was raised. `md` is the default every store gets without choosing,
 * so changing it would redesign the header of every shop that never asked.
 */
export const LOGO_HEIGHT: Record<string, string> = {
  sm: 'h-7 sm:h-8',
  md: 'h-9 sm:h-11',
  lg: 'h-14 sm:h-[4.5rem]',
};

/** What the admin calls each preset, and a one-line description of it. */
export const BACKGROUND_LABELS: Record<string, { name: string; hint: string }> = {
  plain: { name: 'Plain', hint: 'Flat white. Lets product photography do the work.' },
  wash: { name: 'Wash', hint: 'A soft tint of your primary colour down from the top.' },
  paper: { name: 'Paper', hint: 'Warm off-white with a faint texture.' },
  aurora: { name: 'Aurora', hint: 'Two soft glows in your brand colours.' },
  dots: { name: 'Dots', hint: 'A fine dotted grid. Quietly technical.' },
  lines: { name: 'Lines', hint: 'Diagonal hairlines. Texture, not pattern.' },
  halo: { name: 'Halo', hint: 'A glow behind the hero that scrolls away.' },
  midnight: { name: 'Midnight', hint: 'Dark surface with light type. For luxury.' },
};
