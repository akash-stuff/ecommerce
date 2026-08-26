import { assertRenderable, parseWindow, safeLink } from '../src/banners/banners.service';

/**
 * A banner's `linkUrl` becomes an `href` on the storefront. React escapes text
 * content, not attribute values, so a `javascript:` URL stored here would
 * execute on click — the same class of bug the theme's social links guard
 * against, which is why both are checked on write.
 */
describe('banner link sanitisation', () => {
  it('keeps an absolute http(s) address', () => {
    expect(safeLink('https://example.com/sale')).toBe('https://example.com/sale');
    expect(safeLink('http://example.com')).toBe('http://example.com');
  });

  it('keeps a site-relative path', () => {
    expect(safeLink('/shop')).toBe('/shop');
    expect(safeLink('/category/shoes?sort=new')).toBe('/category/shoes?sort=new');
  });

  it('drops a javascript: URL', () => {
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink('JavaScript:alert(1)')).toBeNull();
    // Leading whitespace is stripped before the scheme is examined, so padding
    // it does not get past the check.
    expect(safeLink('  javascript:alert(1)')).toBeNull();
  });

  it('drops other executable and data schemes', () => {
    expect(safeLink('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeLink('vbscript:msgbox(1)')).toBeNull();
    expect(safeLink('file:///etc/passwd')).toBeNull();
  });

  /**
   * `//evil.com` is a protocol-relative URL: it looks like a path and navigates
   * off-site. It must not be mistaken for a site-relative link.
   */
  it('drops a protocol-relative URL', () => {
    expect(safeLink('//evil.com')).toBeNull();
    expect(safeLink('//evil.com/path')).toBeNull();
  });

  it('treats blank and absent as no link', () => {
    expect(safeLink('')).toBeNull();
    expect(safeLink('   ')).toBeNull();
    expect(safeLink(undefined)).toBeNull();
  });
});

describe('banner scheduling window', () => {
  it('accepts an open-ended window', () => {
    expect(parseWindow(undefined, undefined)).toEqual({ startsAt: null, endsAt: null });
  });

  it('accepts a start before its end', () => {
    const window = parseWindow('2026-01-01T00:00:00.000Z', '2026-01-08T00:00:00.000Z');
    expect(window.startsAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(window.endsAt).toEqual(new Date('2026-01-08T00:00:00.000Z'));
  });

  it('refuses an end that is not after its start', () => {
    expect(() => parseWindow('2026-01-08T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toThrow();
    // Equal bounds would mean a banner that is never live.
    expect(() => parseWindow('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toThrow();
  });
});

/**
 * The two placements carry their content differently, so "is this banner
 * renderable" is a per-placement question. Saving one that would draw nothing
 * is the failure this prevents: it looks saved and never appears.
 */
describe('banner content requirements', () => {
  it('requires an image for the homepage hero', () => {
    expect(() => assertRenderable('HOME_HERO', undefined, 'Winter sale')).toThrow();
    expect(() => assertRenderable('HOME_HERO', 'https://cdn/x.jpg')).not.toThrow();
  });

  it('requires a message for the announcement strip', () => {
    expect(() => assertRenderable('SITE_ANNOUNCEMENT', 'https://cdn/x.jpg')).toThrow();
    expect(() => assertRenderable('SITE_ANNOUNCEMENT', undefined, 'Free delivery')).not.toThrow();
  });
});
