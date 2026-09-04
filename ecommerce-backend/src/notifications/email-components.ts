/**
 * The pieces every transactional email is assembled from.
 *
 * Templates call these; they do not write table markup. That is the point — an
 * email built by hand acquires its own margins and its own greys, and after
 * eight of them nothing matches. Here a heading is `h1()` everywhere, and
 * changing what a heading looks like is one edit.
 *
 * Everything is a table. Not a stylistic preference: Outlook on Windows renders
 * mail through the Word engine, which has no flexbox, no grid, no `max-width`
 * on a div and no padding on a div either. A `<div>` appears below only as a
 * leaf container for text that is fully styled inline.
 *
 * Every declaration that affects layout is inlined on the element as well as
 * being in the stylesheet, because the Gmail app signed in to a non-Google
 * account strips the `<style>` block entirely and there is no way to detect it.
 * The classes are carried *alongside* the inline values, never instead of them:
 * a media query cannot repaint a cell it does not select, and the `!important`
 * in the dark block is what beats the inline colour that has to be there for
 * everyone else. Miss a class on a cell that has a `bgcolor` and that one cell
 * stays light on a dark card — the characteristic half-inverted email.
 */
import {
  CARD_WIDTH,
  GUTTER,
  INK,
  MONO,
  SANS,
  buttonFill,
  edgeOf,
  escapeHtml,
  head,
  inkOn,
  safeHex,
  safeUrl,
} from './email-theme';

/** Everything a template needs to know about the store it is sent on behalf of. */
export interface EmailBrand {
  storeName: string;
  /**
   * The address a shopper may write to, or null when there is none to publish.
   *
   * Null is not "missing" — it is a decision. The address on file is withheld
   * when it turns out to be one someone signs in to the store with, because an
   * email body is the worst possible place to print one: `deliverEmail` stores
   * the rendered body so a failed send can be replayed, so the address outlives
   * the send in a database column *and* sits in every recipient's inbox
   * forever. See `isStaffLoginEmail`.
   *
   * Nullable rather than defaulted to '' so that every render site has to say
   * what it does without one, instead of quietly printing "Store &middot; ".
   */
  storeEmail: string | null;
  /** Validated on the way in; `safeHex` guarantees six digits by the time it is used. */
  brandColor: string;
  logoUrl: string | null;
  /** Used for the one button an email is allowed. Null when no domain is live. */
  storefrontUrl?: string | null;
}

/** `line-height` in Word means "at least", so every one is pinned. */
const LH = 'mso-line-height-rule:exactly;';

const text = (
  size: number,
  lineHeight: number,
  weight: number,
  colour: string,
  extra = '',
): string =>
  `font-family:${SANS};font-size:${size}px;line-height:${lineHeight}px;${LH}` +
  `font-weight:${weight};color:${colour};${extra}`;

// --- Blocks ------------------------------------------------------------------

/** A vertical gap. Spacer rows, never margins — Outlook drops margins on a td. */
export const spacer = (height: number): string =>
  `<tr><td height="${height}" style="height:${height}px;line-height:${height}px;font-size:0;">&nbsp;</td></tr>`;

/** A hairline across the measure. A 1px cell, because `<hr>` carries client defaults. */
export const divider = (): string =>
  `<tr><td class="sm-px" style="padding:0 ${GUTTER}px;">` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">` +
  `<tr><td class="e-rule" height="1" bgcolor="${INK.RULE}" style="height:1px;line-height:1px;font-size:0;background-color:${INK.RULE};">&nbsp;</td></tr>` +
  `</table></td></tr>`;

/** A small-caps label. Sits above a heading, or titles a section. */
export const eyebrow = (label: string): string =>
  `<tr><td class="sm-px e-muted" style="padding:0 ${GUTTER}px;${text(11, 16, 700, INK.MUTED, 'letter-spacing:1.2px;text-transform:uppercase;')}">` +
  `${escapeHtml(label)}</td></tr>`;

export const h1 = (value: string): string =>
  `<tr><td class="sm-px sm-h1 e-strong" style="padding:0 ${GUTTER}px;${text(26, 34, 700, INK.STRONG, 'letter-spacing:-0.2px;')}">` +
  `${escapeHtml(value)}</td></tr>`;

export const h2 = (value: string): string =>
  `<tr><td class="sm-px e-strong" style="padding:0 ${GUTTER}px;${text(16, 24, 700, INK.HEADING)}">` +
  `${escapeHtml(value)}</td></tr>`;

/** The opening paragraph, set a size larger than the body. */
export const lede = (html: string): string =>
  `<tr><td class="sm-px e-body" style="padding:0 ${GUTTER}px;${text(16, 26, 400, INK.BODY)}">${html}</td></tr>`;

export const paragraph = (html: string): string =>
  `<tr><td class="sm-px e-body" style="padding:0 ${GUTTER}px;${text(15, 24, 400, INK.BODY)}">${html}</td></tr>`;

export const small = (html: string): string =>
  `<tr><td class="sm-px e-muted" style="padding:0 ${GUTTER}px;${text(13, 20, 400, INK.MUTED)}">${html}</td></tr>`;

/** An inset block: a totals summary, an address, a reason for a cancellation. */
export const panel = (innerHtml: string): string =>
  `<tr><td class="sm-px" style="padding:0 ${GUTTER}px;">` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">` +
  `<tr><td class="e-panel" bgcolor="${INK.PANEL}" style="background-color:${INK.PANEL};border:1px solid ${INK.RULE};padding:20px 24px;">` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${innerHtml}</table>` +
  `</td></tr></table></td></tr>`;

// --- The verification code ---------------------------------------------------

/**
 * The code, set large in a panel of its own.
 *
 * Spaced for reading — `408 215` is easier to hold in your head across the walk
 * to another device than `408215`. The plain-text part carries it unspaced,
 * because that is the one someone copies and pastes.
 *
 * `user-select:all` is a courtesy that works in Apple Mail and does nothing
 * anywhere else. It costs one declaration.
 */
export function codeBlock(code: string): string {
  const spaced = code.replace(/(\d{3})(\d{3})/, '$1 $2');

  return (
    `<tr><td class="sm-px" style="padding:0 ${GUTTER}px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">` +
    `<tr><td class="e-panel" bgcolor="${INK.PANEL}" align="center" style="background-color:${INK.PANEL};border:1px solid ${INK.RULE};padding:22px 16px;">` +
    `<div class="sm-code e-strong" style="font-family:${MONO};font-size:38px;line-height:46px;${LH}font-weight:700;letter-spacing:8px;color:${INK.STRONG};-webkit-user-select:all;user-select:all;">` +
    `${escapeHtml(spaced)}</div>` +
    `</td></tr></table></td></tr>`
  );
}

// --- The button --------------------------------------------------------------

/**
 * One button per email, or none.
 *
 * The VML rectangle is what makes the whole shape clickable in Outlook, where
 * padding on an `<a>` is not a hit area and only the text itself is a target.
 * Its dimensions cannot be derived from the CSS button, so they are computed
 * from the same label here — change one and the other follows.
 *
 * The label is clamped rather than allowed to wrap: a two-line label breaks the
 * 48px height the VML box assumes, which produces a correct button in Gmail and
 * a mismatched one in Outlook — a difference nobody sees until a customer sends
 * a screenshot.
 */
export function button(label: string, href: string | null, brand: string): string {
  const url = safeUrl(href);
  const fill = buttonFill(brand);
  const clamped = label.slice(0, 28);

  // No destination means no button. A disabled-looking control in an email is
  // worse than a sentence saying where to go.
  if (!url) return '';

  const inner = Math.max(120, Math.round(clamped.length * 8.6));
  const outer = inner + 56;

  return (
    `<tr><td class="sm-px" style="padding:0 ${GUTTER}px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="left" style="border-collapse:collapse;">` +
    `<tr><td align="center" bgcolor="${fill}" style="background-color:${fill};border-radius:6px;mso-padding-alt:0;">` +
    `<!--[if mso]>` +
    `<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" ` +
    `href="${url}" style="height:48px;v-text-anchor:middle;width:${outer}px;" arcsize="25%" stroke="f" fillcolor="${fill}">` +
    `<w:anchorlock/>` +
    `<center style="color:#FFFFFF;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:700;">${escapeHtml(clamped)}</center>` +
    `</v:roundrect>` +
    `<![endif]-->` +
    `<!--[if !mso]><!-->` +
    `<a href="${url}" style="display:inline-block;width:${inner}px;padding:14px 28px;border-radius:6px;` +
    `background-color:${fill};color:#FFFFFF !important;font-family:${SANS};font-size:15px;line-height:20px;${LH}` +
    `font-weight:700;text-align:center;text-decoration:none !important;-webkit-text-size-adjust:none;">${escapeHtml(clamped)}</a>` +
    `<!--<![endif]-->` +
    `</td></tr></table></td></tr>`
  );
}

/**
 * The button together with the space above it, or nothing at all.
 *
 * Templates call this rather than `button()` directly, because a button that
 * renders as an empty string still leaves its spacers behind — and a store with
 * no domain connected yet got a receipt with eighty-four pixels of nothing in
 * the middle of it. Space that belongs to an element has to be emitted by that
 * element.
 */
export function cta(label: string, href: string | null, brand: string): string {
  const markup = button(label, href, brand);
  return markup === '' ? '' : spacer(26) + markup;
}

// --- Receipt pieces ----------------------------------------------------------

export interface LineItem {
  name: string;
  variantName?: string | null;
  quantity: number;
  lineTotal: string;
}

/**
 * The ordered items, one hairline-separated row each.
 *
 * The amount column is fixed-width and `nowrap`, which is what keeps the
 * figures in a column when the name beside them wraps to three lines. A grid
 * would be prettier and would collapse in Outlook.
 */
export function itemsTable(items: LineItem[], money: (value: string) => string): string {
  const rows = items
    .map(
      (item, index) => `
      <tr>
        <td class="e-strong" style="padding:${index === 0 ? '0' : '14px'} 16px 0 0;${text(15, 22, 700, INK.STRONG)}">
          ${escapeHtml(item.name)}
          <div class="e-muted" style="${text(13, 20, 400, INK.MUTED, 'padding-top:2px;')}">
            ${item.variantName ? `${escapeHtml(item.variantName)} &middot; ` : ''}Qty ${item.quantity}
          </div>
        </td>
        <td width="120" align="right" valign="top" class="e-strong" style="width:120px;padding:${index === 0 ? '0' : '14px'} 0 0 0;white-space:nowrap;font-family:${MONO};font-size:14px;line-height:22px;${LH}font-weight:400;color:${INK.STRONG};">
          ${escapeHtml(money(item.lineTotal))}
        </td>
      </tr>
      <tr><td colspan="2" height="14" style="height:14px;line-height:14px;font-size:0;">&nbsp;</td></tr>
      <tr><td colspan="2" class="e-rule" height="1" bgcolor="${INK.RULE}" style="height:1px;line-height:1px;font-size:0;background-color:${INK.RULE};">&nbsp;</td></tr>`,
    )
    .join('');

  return (
    `<tr><td class="sm-px" style="padding:0 ${GUTTER}px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows}</table>` +
    `</td></tr>`
  );
}

/** One row of the totals block. `strong` marks the grand total. */
export function totalRow(label: string, value: string, strong = false): string {
  return (
    `<tr>` +
    `<td class="${strong ? 'e-strong' : 'e-body'}" style="padding:${strong ? '10px 0 0' : '5px 0'};${text(strong ? 16 : 14, strong ? 24 : 22, strong ? 700 : 400, strong ? INK.STRONG : INK.BODY)}">${escapeHtml(label)}</td>` +
    `<td align="right" class="${strong ? 'e-strong' : 'e-body'}" style="padding:${strong ? '10px 0 0' : '5px 0'};white-space:nowrap;font-family:${MONO};font-size:${strong ? 16 : 14}px;line-height:${strong ? 24 : 22}px;${LH}font-weight:${strong ? 700 : 400};color:${strong ? INK.STRONG : INK.BODY};">${escapeHtml(value)}</td>` +
    `</tr>`
  );
}

/** The rule that separates the running totals from the grand total. */
export const totalsRule = (): string =>
  `<tr><td colspan="2" class="e-rule" height="1" bgcolor="${INK.RULE_STRONG}" style="height:1px;line-height:1px;font-size:0;background-color:${INK.RULE_STRONG};">&nbsp;</td></tr>` +
  `<tr><td colspan="2" height="4" style="height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>`;

/** A label above a block of detail, inside a panel. */
export const panelLabel = (label: string): string =>
  `<tr><td class="e-muted" style="${text(11, 16, 700, INK.MUTED, 'letter-spacing:1.2px;text-transform:uppercase;padding-bottom:6px;')}">${escapeHtml(label)}</td></tr>`;

export const panelBody = (html: string): string =>
  `<tr><td class="e-body" style="${text(14, 22, 400, INK.BODY)}">${html}</td></tr>`;

// --- The shell ---------------------------------------------------------------

/**
 * The header: a logo on a plate, or the store's name on a band of its colour.
 *
 * Mutually exclusive, deliberately. A band is an arbitrary tenant colour and a
 * logo is an arbitrary tenant image; putting one on the other is a coin flip
 * that this platform cannot call — a dark logo on a dark green band is
 * invisible. So a store *without* a logo gets the stronger brand expression,
 * which is the right way round: it is the one with less to show.
 *
 * ## The known limitation, stated plainly
 *
 * Mail clients do not invert the pixels inside an `<img>`; they invert the
 * background behind it. A tenant who uploads a dark transparent PNG will, in
 * Gmail's forced dark theme, get dark ink on a plate that has been flipped to
 * near-black — a header that looks blank rather than broken, so nobody reports
 * it. There is no CSS answer: the inversion happens after CSS resolves. The
 * real fix is to composite each uploaded logo onto an opaque plate server-side
 * and store that as a separate email asset. That is a media-pipeline change,
 * not a template one, so what happens here instead is that the plate keeps an
 * explicit white `bgcolor` and is deliberately *not* repainted by the dark
 * media query — a letterhead plate on a dark card — which gets it right in
 * every client that honours the query, and honestly cannot help in the ones
 * that do not.
 */
function header(brand: EmailBrand): string {
  const accent = safeHex(brand.brandColor);
  const logo = safeUrl(brand.logoUrl, true);
  const name = escapeHtml(brand.storeName);

  if (logo) {
    return (
      // `e-plate`, not `e-card`: this one white cell is deliberately excluded
      // from the dark repaint. A logo is an image, and clients invert the
      // ground behind an image without touching its pixels — so a plate that
      // followed the card into the dark would take a dark logo with it.
      `<tr><td class="sm-px e-plate" bgcolor="${INK.CARD}" align="left" style="background-color:${INK.CARD};padding:28px ${GUTTER}px;">` +
      // The alt text is styled to be the wordmark it replaces, so a blocked
      // image — the default in corporate Outlook — degrades into exactly what a
      // store with no logo would have shown, rather than into a red cross.
      `<img src="${logo}" alt="${name}" height="40" style="display:block;height:40px;width:auto;max-width:220px;border:0;${text(18, 40, 700, INK.STRONG, 'letter-spacing:0.4px;')}">` +
      `</td></tr>` +
      `<tr><td height="4" bgcolor="${accent}" style="height:4px;line-height:4px;font-size:0;background-color:${accent};">&nbsp;</td></tr>`
    );
  }

  const ink = inkOn(accent);
  return (
    `<tr><td class="sm-px" bgcolor="${accent}" align="left" style="background-color:${accent};padding:26px ${GUTTER}px;${text(20, 28, 700, ink, 'letter-spacing:0.4px;')}">` +
    `${name}</td></tr>` +
    // Unconditional. On a saturated brand it reads as a deliberate shadow line;
    // on a near-white one it is the only thing separating band from card.
    `<tr><td height="1" bgcolor="${edgeOf(accent)}" style="height:1px;line-height:1px;font-size:0;background-color:${edgeOf(accent)};">&nbsp;</td></tr>`
  );
}

/**
 * How to reach the shop, for the end of a signature. Null when there is no way
 * worth printing.
 *
 * The storefront stands in for a withheld address. Dropping the tail entirely
 * would be tidier and worse: "reply to this email" reaches SMTP_FROM, which on
 * most installs is a noreply, so with nothing here a receipt offers a shopper
 * no route back to the shop at all.
 */
export function contactTail(brand: EmailBrand): string | null {
  return brand.storeEmail ?? brand.storefrontUrl ?? null;
}

/** The quiet line under the card. On the page, not in it. */
function footer(brand: EmailBrand, extraHtml = ''): string {
  const tail = contactTail(brand);

  return (
    `<table role="presentation" width="${CARD_WIDTH}" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:${CARD_WIDTH}px;border-collapse:collapse;">` +
    `<tr><td class="sm-px e-muted" align="center" style="padding:20px ${GUTTER}px 0;${text(12, 20, 400, INK.MUTED)}">` +
    (extraHtml ? `${extraHtml}<br>` : '') +
    `${escapeHtml(brand.storeName)}` +
    (tail ? ` &middot; ${escapeHtml(tail)}` : '') +
    `</td></tr></table>`
  );
}

/**
 * Wraps sections into the page.
 *
 * Each section becomes its own sibling 600px table rather than one tall one.
 * Word paginates at roughly 1790px and clips a taller table's background at the
 * boundary, which is exactly the risk on an order confirmation with thirty line
 * items — and it shows as a white band through the card. The borders are
 * computed here so the three tables read as one card and cannot drift apart.
 */
export function shell(options: {
  brand: EmailBrand;
  title: string;
  /** The one-line inbox preview. Without it the client shows the header instead. */
  preheader: string;
  /** Each entry is a run of `<tr>` rows. */
  sections: string[];
  footerNote?: string;
}): string {
  const { brand, title, preheader, sections, footerNote } = options;

  const cards = sections
    .filter((section) => section.trim() !== '')
    .map((section, index, all) => {
      const first = index === 0;
      const last = index === all.length - 1;
      const border =
        `border-left:1px solid ${INK.RULE};border-right:1px solid ${INK.RULE};` +
        (first ? `border-top:1px solid ${INK.RULE};` : '') +
        (last ? `border-bottom:1px solid ${INK.RULE};` : '');

      return (
        `<table role="presentation" class="e-card" width="${CARD_WIDTH}" cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="${INK.CARD}" ` +
        `style="width:100%;max-width:${CARD_WIDTH}px;border-collapse:collapse;background-color:${INK.CARD};${border}">` +
        section +
        `</table>`
      );
    })
    .join('');

  return `${head(title)}
<body id="body" class="e-page" bgcolor="${INK.PAGE}" style="margin:0;padding:0;width:100%;background-color:${INK.PAGE};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${INK.PAGE};">${escapeHtml(preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
  <table role="presentation" class="e-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${INK.PAGE}" style="border-collapse:collapse;background-color:${INK.PAGE};">
    <tr><td align="center" style="padding:24px 12px 40px;">
      <!--[if mso]><table role="presentation" width="${CARD_WIDTH}" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
      ${cards}
      ${footer(brand, footerNote)}
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}

/** The header rows plus the opening gap, which every template starts with. */
export const openCard = (brand: EmailBrand): string => header(brand) + spacer(32);

export { escapeHtml };
