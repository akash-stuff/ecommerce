/**
 * Custom CSS is written by tenant staff and injected into a `<style>` block on
 * the storefront. That makes it executable surface: a `</style>` breakout turns
 * a stylesheet into arbitrary HTML and script running on the store's own
 * origin, against that store's customers.
 *
 * Everything here is refused rather than quietly stripped. Silently mangling
 * someone's stylesheet produces a bug they cannot see; naming the offending
 * construct lets them fix it.
 */

export const MAX_CUSTOM_CSS_LENGTH = 20_000;

export interface CssRejection {
  pattern: string;
  reason: string;
}

const FORBIDDEN: { test: RegExp; pattern: string; reason: string }[] = [
  {
    test: /<\s*\/?\s*style/i,
    pattern: '<style> or </style>',
    reason: 'closing the style block would let the rest run as HTML',
  },
  {
    test: /<\s*script/i,
    pattern: '<script>',
    reason: 'script tags are not stylesheet content',
  },
  {
    test: /<!--|-->/,
    pattern: 'HTML comments',
    reason: 'HTML comment markers can be used to break out of the style block',
  },
  {
    test: /javascript\s*:/i,
    pattern: 'javascript: URLs',
    reason: 'a javascript: URL executes code',
  },
  {
    test: /vbscript\s*:/i,
    pattern: 'vbscript: URLs',
    reason: 'a vbscript: URL executes code',
  },
  {
    test: /expression\s*\(/i,
    pattern: 'expression()',
    reason: 'legacy IE expressions execute JavaScript',
  },
  {
    test: /-moz-binding/i,
    pattern: '-moz-binding',
    reason: 'XBL bindings can execute script',
  },
  {
    test: /behaviou?r\s*:/i,
    pattern: 'behavior:',
    reason: 'behaviours attach executable HTML components',
  },
  {
    test: /@import/i,
    pattern: '@import',
    reason: 'importing a remote stylesheet leaks visitor data to a third party',
  },
];

/**
 * CSS lets any character be written as a hex escape, so `\6a avascript:` is the
 * same as `javascript:` to a browser but not to a naive string search. Decoding
 * before the check closes that bypass.
 */
function decodeCssEscapes(css: string): string {
  return css.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => {
    const code = Number.parseInt(hex, 16);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : '';
  });
}

/** Comments can hide payload fragments from a reader; they carry no styling. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Only schemes that can appear in a stylesheet legitimately. Relative paths and
 * fragments are fine; anything exotic is not.
 */
function checkUrls(css: string): CssRejection[] {
  const rejections: CssRejection[] = [];
  const urlPattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

  for (const match of css.matchAll(urlPattern)) {
    const value = match[2].trim();
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1]?.toLowerCase();

    if (!scheme) continue; // relative path or fragment
    if (scheme === 'https' || scheme === 'http') continue;
    if (scheme === 'data' && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(value)) {
      continue;
    }

    rejections.push({
      pattern: `url(${scheme}:…)`,
      reason: `only http(s) and data:image URLs are allowed in custom CSS`,
    });
  }

  return rejections;
}

export interface SanitiseResult {
  css: string;
  rejections: CssRejection[];
}

/**
 * Returns the cleaned CSS and anything that disqualified it. An empty
 * `rejections` array means the CSS is safe to store and render.
 */
export function sanitiseCustomCss(input: string | null | undefined): SanitiseResult {
  if (!input || input.trim() === '') return { css: '', rejections: [] };

  const withoutComments = stripComments(input);
  const decoded = decodeCssEscapes(withoutComments);

  const rejections: CssRejection[] = [];

  for (const rule of FORBIDDEN) {
    if (rule.test.test(decoded)) {
      rejections.push({ pattern: rule.pattern, reason: rule.reason });
    }
  }

  rejections.push(...checkUrls(decoded));

  if (withoutComments.length > MAX_CUSTOM_CSS_LENGTH) {
    rejections.push({
      pattern: 'length',
      reason: `custom CSS is limited to ${MAX_CUSTOM_CSS_LENGTH} characters`,
    });
  }

  // Comments are dropped even when the CSS is accepted: they are the usual
  // hiding place for a payload a reviewer would skim past.
  return { css: withoutComments.trim(), rejections };
}
