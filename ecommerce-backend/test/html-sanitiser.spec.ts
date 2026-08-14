import { sanitiseHtml } from '../src/pages/html-sanitiser';

const clean = (html: string) => sanitiseHtml(html).html;
const removed = (html: string) => sanitiseHtml(html).removed;

/**
 * Page content is written by a shop owner and rendered on their own storefront,
 * so anything that executes runs against their customers. The list is an
 * allowlist: these tests exist to prove it fails closed.
 */
describe('page HTML sanitiser', () => {
  it('keeps the markup an About page actually needs', () => {
    const html = clean(
      '<h2>About us</h2><p>We sell <strong>wool</strong> and <em>linen</em>.</p><ul><li>One</li></ul>',
    );
    expect(html).toContain('<h2>About us</h2>');
    expect(html).toContain('<strong>wool</strong>');
    expect(html).toContain('<li>One</li>');
  });

  it('treats empty input as empty rather than an error', () => {
    expect(sanitiseHtml('')).toEqual({ html: '', removed: [] });
    expect(sanitiseHtml(null)).toEqual({ html: '', removed: [] });
  });

  // --- script removal ------------------------------------------------------

  it('removes a script tag and its contents', () => {
    const html = clean('<p>Hi</p><script>alert(1)</script>');
    expect(html).toBe('<p>Hi</p>');
    expect(html).not.toContain('alert');
  });

  it('does not leave script source behind as visible text', () => {
    // Removing only the tags would print the code on the page.
    expect(clean('<script>var secret = 1;</script>')).toBe('');
  });

  it('removes an unclosed script tag', () => {
    expect(clean('<p>a</p><script src="//evil/x.js">')).toBe('<p>a</p>');
  });

  it('removes style, iframe, object and embed with their contents', () => {
    expect(clean('<style>body{display:none}</style>')).toBe('');
    expect(clean('<iframe src="//evil"></iframe>')).toBe('');
    expect(clean('<object data="x"></object>')).toBe('');
    expect(clean('<embed src="x">')).toBe('');
  });

  it('strips HTML comments', () => {
    expect(clean('<p>a</p><!-- <script>x()</script> -->')).toBe('<p>a</p>');
  });

  // --- attributes ----------------------------------------------------------

  it('strips every event handler', () => {
    const html = clean('<p onclick="steal()" onmouseover="x()">text</p>');
    expect(html).toBe('<p>text</p>');
    expect(removed('<p onclick="x()">t</p>')).toContain('event handlers');
  });

  it('strips an event handler even on an allowed tag with allowed attributes', () => {
    const html = clean('<a href="/x" onclick="steal()">link</a>');
    expect(html).toContain('href="/x"');
    expect(html).not.toContain('onclick');
  });

  it('drops attributes that are not on the list', () => {
    expect(clean('<p style="position:fixed" class="x" id="y">t</p>')).toBe('<p>t</p>');
  });

  // --- URLs ----------------------------------------------------------------

  it('allows ordinary links and images', () => {
    expect(clean('<a href="https://example.com">x</a>')).toContain('href="https://example.com"');
    expect(clean('<a href="/shop">x</a>')).toContain('href="/shop"');
    expect(clean('<a href="mailto:a@b.com">x</a>')).toContain('mailto:');
    expect(clean('<img src="https://cdn.example/a.png" alt="a">')).toContain('src=');
  });

  it('refuses a javascript: URL', () => {
    expect(clean('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(removed('<a href="javascript:alert(1)">x</a>')).toContain('unsafe URLs');
  });

  /** `java&#09;script:` and `java script:` both reach the browser as a scheme. */
  it('refuses a javascript: URL hidden by entities or whitespace', () => {
    expect(clean('<a href="java&#09;script:alert(1)">x</a>')).not.toContain('script:');
    expect(clean('<a href="java\tscript:alert(1)">x</a>')).not.toContain('script:');
    expect(clean('<a href="JaVaScRiPt:alert(1)">x</a>')).not.toContain('script:');
  });

  it('allows a data: image but not a data: document', () => {
    expect(clean('<img src="data:image/png;base64,iVBOR">')).toContain('data:image/png');
    expect(clean('<img src="data:text/html;base64,PHNjcmlwdD4=">')).not.toContain('data:text/html');
  });

  /** Without noopener the opened page can navigate the store elsewhere. */
  it('adds noopener to a link that opens a new tab', () => {
    const html = clean('<a href="https://example.com" target="_blank">x</a>');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  // --- structural safety ---------------------------------------------------

  /**
   * A single-quoted value containing a double quote is an attempt to close the
   * attribute early and start a new one. Escaping is the correct outcome, not
   * deletion: the text survives inside `href` where the browser treats it as
   * part of the URL, and no second attribute is ever created.
   */
  it('escapes quotes so an attribute cannot be broken out of', () => {
    const html = clean('<a href=\'/x" onmouseover="steal()\'>link</a>');

    // No real handler attribute — the quote that would have started one is escaped.
    expect(html).not.toMatch(/\son[a-z]+\s*=\s*"/i);
    expect(html).toContain('&quot;');
  });

  it('drops an unknown tag but keeps its text', () => {
    expect(clean('<marquee>hello</marquee>')).toBe('hello');
    expect(clean('<custom-element>text</custom-element>')).toBe('text');
  });

  it('removes a dangling malformed tag', () => {
    expect(clean('<p>ok</p><script')).toBe('<p>ok</p>');
  });

  it('reports what it removed rather than silently differing', () => {
    const result = sanitiseHtml('<script>x()</script><p onclick="y()">t</p><marquee>m</marquee>');
    expect(result.removed).toEqual(expect.arrayContaining(['<script>', 'event handlers', '<marquee>']));
  });

  it('leaves clean content untouched and reports nothing removed', () => {
    const input = '<h2>Terms</h2><p>Read them.</p>';
    const result = sanitiseHtml(input);
    expect(result.html).toBe(input);
    expect(result.removed).toEqual([]);
  });
});
