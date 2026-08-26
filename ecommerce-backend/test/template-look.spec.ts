import { templateLook } from '../src/theme/template-look';
import { ALLOWED_FONTS, HOMEPAGE_SECTIONS } from '../src/theme/dto/theme.dto';

/**
 * A template's look is stored as two `Json` columns and read back whenever a
 * store adopts it — at provisioning, or when a shopkeeper switches template
 * from Appearance. Validation on write is not enough on its own: the row
 * outlives the allowlist that accepted it, so a font dropped from
 * `ALLOWED_FONTS` or a section the storefront no longer renders is still
 * sitting in the database waiting to be applied.
 *
 * The font list is the one that matters most. The storefront asks Google Fonts
 * for a face *by name*, so a value that gets through here becomes part of a
 * request URL on every store built from the template.
 */
describe('templateLook', () => {
  it('keeps a well-formed template intact', () => {
    const look = templateLook(
      {
        primaryColor: '#141414',
        secondaryColor: '#8A8A8A',
        accentColor: '#D4AF37',
        headingFont: 'Playfair Display',
        bodyFont: 'Inter',
      },
      { sections: ['hero', 'featured', 'newsletter'] },
    );

    expect(look).toEqual({
      primaryColor: '#141414',
      secondaryColor: '#8A8A8A',
      accentColor: '#D4AF37',
      headingFont: 'Playfair Display',
      bodyFont: 'Inter',
      homepageLayout: ['hero', 'featured', 'newsletter'],
    });
  });

  it('drops a font that is not on the allowlist', () => {
    const look = templateLook(
      { headingFont: 'Comic Sans MS', bodyFont: 'Inter' },
      {},
    );

    expect(look.headingFont).toBeUndefined();
    expect(look.bodyFont).toBe('Inter');
  });

  /**
   * The value reaches a URL, so the interesting inputs are the ones that try to
   * leave the font name and become something else in the request.
   */
  it('drops a font name carrying a URL or markup', () => {
    for (const font of [
      'Inter&text=<script>',
      'Inter"/><script>alert(1)</script>',
      'https://evil.example/font.css',
      '../../etc/passwd',
      'Inter ',
    ]) {
      expect(templateLook({ headingFont: font }, {}).headingFont).toBeUndefined();
    }
  });

  it('accepts every font it offers, and every section', () => {
    // Guards against the allowlist and this filter drifting apart, which would
    // make a legitimately chosen font silently vanish on apply.
    for (const font of ALLOWED_FONTS) {
      expect(templateLook({ bodyFont: font }, {}).bodyFont).toBe(font);
    }
    expect(
      templateLook({}, { sections: [...HOMEPAGE_SECTIONS] }).homepageLayout,
    ).toEqual([...HOMEPAGE_SECTIONS]);
  });

  it('keeps the three-, six- and eight-digit hex forms', () => {
    const look = templateLook(
      { primaryColor: '#abc', secondaryColor: '#AABBCC', accentColor: '#aabbccdd' },
      {},
    );
    expect(look.primaryColor).toBe('#abc');
    expect(look.secondaryColor).toBe('#AABBCC');
    expect(look.accentColor).toBe('#aabbccdd');
  });

  /**
   * A length CSS does not recognise is worse than a wrong colour: the property
   * is discarded at parse time, so the element renders with no colour and
   * nothing anywhere says why.
   */
  it('drops a hex value of a length CSS does not accept', () => {
    for (const colour of ['#ab', '#abcde', '#abcdefg', '#abcdefghi']) {
      expect(templateLook({ primaryColor: colour }, {}).primaryColor).toBeUndefined();
    }
  });

  it('drops a colour that is not hex at all', () => {
    for (const colour of ['red', 'rgb(0,0,0)', 'url(javascript:alert(1))', '#', '']) {
      expect(templateLook({ primaryColor: colour }, {}).primaryColor).toBeUndefined();
    }
  });

  it('drops a section the storefront cannot render', () => {
    const look = templateLook({}, { sections: ['hero', 'testimonials', 'featured'] });
    expect(look.homepageLayout).toEqual(['hero', 'featured']);
  });

  /** The array *is* the homepage order, so it must survive filtering unsorted. */
  it('preserves section order rather than a canonical one', () => {
    const look = templateLook({}, { sections: ['newsletter', 'categories', 'hero'] });
    expect(look.homepageLayout).toEqual(['newsletter', 'categories', 'hero']);
  });

  it('collapses a repeated section', () => {
    const look = templateLook({}, { sections: ['hero', 'featured', 'hero'] });
    expect(look.homepageLayout).toEqual(['hero', 'featured']);
  });

  /**
   * Applying an empty layout would blank a working homepage. Leaving the
   * store's existing order alone is the lesser surprise, so the key is absent
   * rather than an empty array.
   */
  it('does not apply a layout when nothing survives', () => {
    expect(templateLook({}, { sections: [] }).homepageLayout).toBeUndefined();
    expect(templateLook({}, { sections: ['nope'] }).homepageLayout).toBeUndefined();
  });

  /**
   * Every field is optional and independently dropped, so a partly-broken
   * template applies the half that is fine instead of failing outright.
   */
  it('applies the valid half of a partly broken template', () => {
    const look = templateLook(
      { primaryColor: '#0B4F9E', secondaryColor: 'not-a-colour', bodyFont: 'Nope' },
      { sections: ['categories', 'invented'] },
    );

    expect(look).toEqual({
      primaryColor: '#0B4F9E',
      homepageLayout: ['categories'],
    });
  });

  it('treats a missing, null or wrongly-shaped column as empty', () => {
    for (const value of [null, undefined, 'a string', 42, ['an', 'array']]) {
      expect(templateLook(value, value)).toEqual({});
    }
  });

  it('ignores keys it does not know about', () => {
    const look = templateLook(
      { primaryColor: '#111111', tenantId: 'abc', isActive: false },
      { sections: ['hero'], columns: 4 },
    );
    expect(look).toEqual({ primaryColor: '#111111', homepageLayout: ['hero'] });
  });
});
