/**
 * The design tokens every transactional email is built from, and the guards
 * that make a tenant's own values safe to put in one.
 *
 * Separated from `templates.ts` because the eight templates are assembly, not
 * authorship: when the receipt and the verification code email each carry their
 * own margins and their own greys, they drift, and after a year they no longer
 * look like the same shop wrote them. One token file is what stops that.
 *
 * ## Why the palette is warm
 *
 * The ink ramp here is the storefront's own (`tailwind.config.js`), not the cold
 * blue-greys every email builder ships. Two reasons: an email that shares a
 * palette with the shop it came from reads as continuous, and a paper-toned
 * ground behind a white card is the one thing that survives Gmail's forced dark
 * inversion — a white card on a white page inverts into a single flat void with
 * no card left in it.
 *
 * ## Where the tenant's colour is allowed to go
 *
 * Two places, and only two: the header band (or the rule beneath a logo) and
 * the fill of the one button an email is allowed to have. It is never a text
 * colour. Tenants pick pale yellows, and `#F5A524` — the platform's own
 * secondary — is 2.04:1 on white, which is unreadable. A system that cannot
 * survive a pale yellow is not a white-label system.
 */

/**
 * HTML-escapes a value for text content.
 *
 * Defined here rather than in `templates.ts` so the component layer can use it
 * without importing back from the module that imports it. `templates.ts`
 * re-exports it, because `seo/ssr.service.ts` and the email specs both import it
 * from there and its exact output spelling is pinned by a test — `&` first so
 * nothing double-escapes, and `'` as `&#39;` rather than `&apos;`.
 *
 * This escapes *text*. It is not sufficient for a URL, a colour, or anything
 * inside a `<style>` block: it leaves `;`, `:`, `(` and `)` untouched, so
 * `red;background-image:url(https://evil/px)` passes through it unharmed. Those
 * contexts have their own guards below, and nothing tenant-supplied reaches a
 * `<style>` block at all.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Palette -----------------------------------------------------------------

/**
 * The warm ink ramp, lifted from the storefront so email and shop agree.
 *
 * `MUTED` is the floor. Nothing lighter than it is ever allowed to carry text:
 * it is 4.77:1 on white, and under a naive inversion it becomes roughly
 * `#888D95`, which is still readable on the inverted ground. The classic
 * failure — a `#98A2B3` grey that inverts into an unreadable brown — is
 * impossible here because that value is not in the palette.
 */
export const INK = {
  /** Headings, product names, totals, the code. 18.25:1 on white. */
  STRONG: '#17150F',
  /** Secondary headings. */
  HEADING: '#221F17',
  /** Running text. 9.42:1. */
  BODY: '#4A463B',
  /** Labels and secondary detail. 6.85:1. */
  SECONDARY: '#5F5A50',
  /** Small caps, item meta, footer. 4.77:1 — the floor. */
  MUTED: '#77726A',
  /** The rule above a grand total; heavier than a hairline. */
  RULE_STRONG: '#CFCAC0',
  /** Every hairline and every border. */
  RULE: '#E5E1D8',
  /** Inset panels. */
  PANEL: '#F7F5F0',
  CARD: '#FFFFFF',
  /** The warm ground behind the card. Deliberately not white — see the header. */
  PAGE: '#EFEBE3',
} as const;

/** Mirrors `brand-defaults.ts`; imported rather than duplicated at the call site. */
export const DEFAULT_BRAND = '#166534';

export const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";

/**
 * Figures and codes only.
 *
 * A receipt reads as a ledger when amounts align down a column, which is the
 * same reason the storefront has a `.numeric` utility. `font-variant-numeric`
 * is not in the safe subset, so a monospace stack does the job instead.
 */
export const MONO =
  "'SF Mono',SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace";

/** Card width, and the measure inside it once the 40px gutters are removed. */
export const CARD_WIDTH = 600;
export const GUTTER = 40;

// --- Guards ------------------------------------------------------------------

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
  return contrast(fill, '#FFFFFF') >= contrast(fill, INK.STRONG)
    ? '#FFFFFF'
    : INK.STRONG;
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
  return contrast(fill, '#FFFFFF') >= 4.5 ? fill : INK.STRONG;
}

/** Multiplies each channel toward black. */
function darken(hex: string, amount: number): string {
  const channel = (start: number): string => {
    const v = parseInt(hex.slice(start, start + 2), 16);
    return Math.max(0, Math.round(v * (1 - amount)))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`.toUpperCase();
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
 * A URL safe to place in `href` or `src`, or null.
 *
 * Null rather than an empty string, so every component can render the *absence*
 * of a link as plain text rather than emitting `href=""` — which is a link to
 * the current document and, in an email, a link to nowhere.
 *
 * `requireHttps` is set for images: an `http` image is blocked or warned about
 * by most clients, whereas an `http` href is merely unfashionable and is what a
 * development admin URL actually looks like.
 */
export function safeUrl(input?: string | null, requireHttps = false): string | null {
  const value = (input ?? '').trim();
  if (value === '') return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  const allowed = requireHttps ? ['https:'] : ['https:', 'http:', 'mailto:'];
  if (!allowed.includes(parsed.protocol)) return null;

  return escapeHtml(parsed.href);
}

/**
 * A value fit for a subject line.
 *
 * Never HTML-escaped: a store called "Tom & Jerry" must arrive in the inbox as
 * "Tom & Jerry", not as "Tom &amp; Jerry". What it does strip is CR and LF —
 * a store name is typed by its owner and lands in a mail header, where a newline
 * is header injection. Nothing does this today, and it is worth closing while
 * the file is open.
 */
export function subjectSafe(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
}

// --- The document head -------------------------------------------------------

/**
 * The `<style>` block, frozen.
 *
 * A module constant with no interpolation of any kind. That is simultaneously
 * the security posture — this is the entire CSS attack surface of every email,
 * and it is empty by construction, so no tenant value can ever reach a CSS
 * context — and the maintenance posture: one string to review rather than eight
 * that can drift.
 *
 * Everything structural is *also* inlined on the elements themselves, because
 * the Gmail app signed in to a non-Google account strips this block entirely and
 * cannot be detected. What lives here is only what has to: media queries, the
 * auto-link neutralisers, and the dark palette.
 */
const STYLE = `
    :root { color-scheme: light dark; supported-color-schemes: light dark; }

    /* Client resets. */
    body { margin:0 !important; padding:0 !important; width:100% !important; }
    table { border-collapse:collapse !important; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    a { text-decoration:none; }

    /* Gmail recolours repeated content in a collapsed thread. */
    .im { color:inherit !important; }

    /* Stops iOS, Gmail, Outlook.com and Samsung Mail styling their own guesses
       at phone numbers, dates and addresses in a blue we did not choose. */
    a[x-apple-data-detectors],
    u + #body a,
    #MessageViewBody a,
    #MessageWebViewDiv a {
      color:inherit !important; text-decoration:none !important;
      font-size:inherit !important; font-family:inherit !important;
      font-weight:inherit !important; line-height:inherit !important;
    }

    @media only screen and (max-width:620px) {
      .sm-px { padding-left:24px !important; padding-right:24px !important; }
      .sm-h1 { font-size:22px !important; line-height:30px !important; }
      .sm-code { font-size:30px !important; letter-spacing:6px !important; }
      .sm-hide { display:none !important; }
      .sm-block { display:block !important; width:100% !important; }
    }

    /* Apple Mail, iOS Mail, Outlook macOS/iOS, Thunderbird, Fastmail, Proton.
       The dark ramp is the same ink scale read from the other end, so a dark
       email is recognisably the same family rather than a second palette
       somebody invented. Gmail and Outlook.com ignore all of this and invert
       whatever they are sent — which the light design is built to survive. */
    /* .e-plate is deliberately absent from every rule below. It is the white
       ground a tenant's logo sits on, and it has to stay white: a client
       inverts the background behind an image without touching the image's own
       pixels, so repainting the plate would hide a dark logo entirely. It
       reads as a letterhead plate on a dark card, which is the intent. */
    @media (prefers-color-scheme: dark) {
      .e-page   { background-color:#17150F !important; }
      .e-card   { background-color:#221F17 !important; border-color:#3A362C !important; }
      .e-panel  { background-color:#2E2A20 !important; border-color:#3A362C !important; }
      .e-rule   { background-color:#3A362C !important; border-color:#3A362C !important; }
      .e-strong { color:#F7F5F0 !important; }
      .e-body   { color:#CFCAC0 !important; }
      .e-muted  { color:#B0ABA1 !important; }
    }

    /* Outlook iOS/Android inverts, but stamps what it touched. Top level, not
       inside the media query, or these never fire. */
    [data-ogsb] .e-page   { background-color:#17150F !important; }
    [data-ogsb] .e-card   { background-color:#221F17 !important; }
    [data-ogsb] .e-panel  { background-color:#2E2A20 !important; }
    [data-ogsc] .e-strong { color:#F7F5F0 !important; }
    [data-ogsc] .e-body   { color:#CFCAC0 !important; }
    [data-ogsc] .e-muted  { color:#B0ABA1 !important; }
`;

/**
 * The document head.
 *
 * `title` is the only substitution and it goes through `escapeHtml`. The VML
 * namespaces on `<html>` are what make the Outlook button work; the
 * `OfficeDocumentSettings` block stops Outlook scaling the whole layout up on a
 * 120dpi Windows display.
 */
export function head(title: string): string {
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch><o:AllowPNG/></o:OfficeDocumentSettings></xml>
  <style>* { font-family:'Segoe UI',Arial,sans-serif !important; }</style>
  <![endif]-->
  <style>${STYLE}</style>
</head>`;
}
