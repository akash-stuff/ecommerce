import { toPromiseRows, NO_PROMISES } from '../src/stores/store-promises';

/**
 * The homepage promise strip has two sources — what the shopkeeper wrote in
 * Appearance, and what can be inferred from their shipping methods when they
 * have written nothing — and the rules for choosing between them are the whole
 * feature. These pin them.
 */
describe('the homepage promise strip', () => {
  const shipping = {
    freeShippingAbove: '5000',
    codAvailable: true,
    minDeliveryDays: 1,
    maxDeliveryDays: 2,
  };

  describe('with nothing written', () => {
    it('words the strip from the shop’s own shipping settings', () => {
      const rows = toPromiseRows([], shipping, 'INR');

      expect(rows.map((r) => r.title)).toEqual([
        'Free delivery',
        'Fast dispatch',
        'Cash on delivery',
      ]);
      expect(rows[0].detail).toBe('On orders over ₹5,000');
      expect(rows[1].detail).toBe('Delivered in 1–2 days');
    });

    it('drops the decimals on a whole-number threshold', () => {
      // "₹5,000.00" reads as a price the shop calculated rather than a round
      // number it chose.
      expect(toPromiseRows([], shipping, 'INR')[0].detail).not.toContain('.00');
    });

    it('keeps them when the threshold is not whole', () => {
      const rows = toPromiseRows([], { ...shipping, freeShippingAbove: '1499.50' }, 'INR');
      expect(rows[0].detail).toContain('1,499.50');
    });

    it('says "1 day", not "1–1 days", when the range has no width', () => {
      const rows = toPromiseRows(
        [],
        { ...shipping, minDeliveryDays: 1, maxDeliveryDays: 1 },
        'INR',
      );
      expect(rows[1].detail).toBe('Delivered in 1 day');
    });

    /**
     * The point of deriving rather than hard-coding: a shop that offers none of
     * this must not be made to claim it. The storefront hides the section below
     * two rows, so an empty result is a strip that never appears.
     */
    it('claims nothing for a shop that has configured nothing', () => {
      expect(toPromiseRows([], NO_PROMISES, 'INR')).toEqual([]);
    });

    it('omits only the parts that are unset', () => {
      const rows = toPromiseRows(
        [],
        { ...NO_PROMISES, codAvailable: true },
        'INR',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('Cash on delivery');
    });
  });

  describe('with rows written', () => {
    const authored = [
      { icon: 'shield', title: 'Made here', detail: 'Finished in Coimbatore' },
      { icon: 'refresh', title: '30-day returns', detail: 'Unworn, with tags' },
    ];

    /**
     * Replaced, not merged. Merging would mean editing one row silently changed
     * what the others said, and a shopkeeper who deleted "Cash on delivery"
     * would watch it come back on the next deploy.
     */
    it('replaces the derived strip rather than adding to it', () => {
      const rows = toPromiseRows(authored, shipping, 'INR');
      expect(rows).toEqual(authored);
      expect(rows.map((r) => r.title)).not.toContain('Free delivery');
    });

    it('hands the strip back to shipping when the rows are cleared', () => {
      expect(toPromiseRows([], shipping, 'INR')[0].title).toBe('Free delivery');
    });

    it('caps the strip at four', () => {
      const many = Array.from({ length: 7 }, (_, i) => ({
        icon: 'truck',
        title: `Row ${i}`,
        detail: 'Detail',
      }));
      expect(toPromiseRows(many, shipping, 'INR')).toHaveLength(4);
    });
  });

  /**
   * This is a JSON column, so its contents are whatever was written into it —
   * by this build, an older one, a seed, or someone at a psql prompt. A
   * malformed row must not reach the page: the failure mode is a tile with a
   * blank line in it and no setting the shopkeeper can find to remove it.
   */
  describe('reading back a column that could contain anything', () => {
    const good = { icon: 'truck', title: 'Free delivery', detail: 'Over ₹999' };

    it('ignores a value that is not an array', () => {
      for (const junk of [null, undefined, 'rows', 42, {}]) {
        expect(toPromiseRows(junk, NO_PROMISES, 'INR')).toEqual([]);
      }
    });

    it('drops rows that are not objects', () => {
      expect(toPromiseRows(['x', null, 7, good], NO_PROMISES, 'INR')).toEqual([good]);
    });

    it('drops a row missing either line', () => {
      const rows = toPromiseRows(
        [{ icon: 'truck', title: 'Only a title' }, { icon: 'truck', detail: 'Only a detail' }, good],
        NO_PROMISES,
        'INR',
      );
      expect(rows).toEqual([good]);
    });

    it('drops a row whose text is only whitespace', () => {
      expect(
        toPromiseRows([{ icon: 'truck', title: '   ', detail: '\\t' }], NO_PROMISES, 'INR'),
      ).toEqual([]);
    });

    /**
     * The icon names a component. An unknown one renders as nothing, so the row
     * goes rather than appearing with a hole where its icon should be.
     */
    it('drops a row naming an icon the storefront does not have', () => {
      expect(
        toPromiseRows([{ icon: 'rocket', title: 'To the moon', detail: 'Fast' }, good], NO_PROMISES, 'INR'),
      ).toEqual([good]);
    });

    it('falls back to shipping when every stored row is malformed', () => {
      const rows = toPromiseRows([{ icon: 'nope', title: '', detail: '' }], shipping, 'INR');
      expect(rows[0].title).toBe('Free delivery');
    });
  });
});
