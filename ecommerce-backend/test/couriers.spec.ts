import {
  COURIERS,
  COURIER_CODES,
  DEFAULT_COURIER,
  courierName,
  findCourier,
  trackingUrlFor,
} from '../src/shipping/couriers';

describe('the courier catalogue', () => {
  it('has no duplicate codes, which would silently shadow one another', () => {
    expect(new Set(COURIER_CODES).size).toBe(COURIER_CODES.length);
  });

  it('offers the code a dispatch falls back to', () => {
    expect(COURIER_CODES).toContain(DEFAULT_COURIER);
  });

  /** A schema default is not a carrier, and must not be selectable as one. */
  it('does not offer the legacy column default as a choice', () => {
    expect(COURIER_CODES).not.toContain('MANUAL');
  });

  /**
   * A carrier with no per-consignment URL must still give a shopper somewhere
   * to take their number — except the two that are not carriers at all.
   */
  it('gives every carrier either a link template or its own tracking page', () => {
    for (const courier of COURIERS) {
      if (courier.code === 'SELF' || courier.code === 'OTHER') continue;
      expect(`${courier.code}: ${courier.track !== null || courier.site !== null}`).toBe(
        `${courier.code}: true`,
      );
    }
  });

  /**
   * `ECOM_EXPRESS` is a database value. Some names are legitimately the code —
   * DTDC and UPS are acronyms — so what is checked is that no stored-looking
   * token reaches a shopper, not that the two strings differ.
   */
  it('names every carrier in words a shopper would recognise', () => {
    // Collected rather than asserted in the loop, so a failure names the
    // offending carriers instead of stopping at the first one.
    const raw = COURIERS.filter((c) => /_/.test(c.name) || c.name.trim() === '').map(
      (c) => c.code,
    );
    expect(raw).toEqual([]);
  });
});

describe('naming a courier', () => {
  it('uses the display name, never the stored code', () => {
    expect(courierName('DELHIVERY')).toBe('Delhivery');
    expect(courierName('ECOM_EXPRESS')).toBe('Ecom Express');
  });

  /**
   * `MANUAL` is the column's own default, so every row written before this
   * catalogue existed carries it. It is a schema artefact, not a carrier, and
   * putting it in a sentence about someone's parcel would be leaking one.
   */
  it('translates the legacy column default rather than showing it', () => {
    expect(courierName('MANUAL')).toBe('Courier');
  });

  /**
   * The column used to be free text, so a row saying "Delhivary" is a typo
   * worth showing back — not a reason to print nothing.
   */
  it('falls back to whatever was stored for a code it does not know', () => {
    expect(courierName('Delhivary')).toBe('Delhivary');
    expect(courierName(null)).toBe('Courier');
  });

  it('finds nothing for an unknown code rather than guessing', () => {
    expect(findCourier('NOT_A_COURIER')).toBeNull();
    expect(findCourier(null)).toBeNull();
  });
});

describe('the tracking link', () => {
  it('is built from the courier and the consignment number', () => {
    expect(trackingUrlFor('DELHIVERY', 'ABC123')).toBe(
      'https://www.delhivery.com/track/package/ABC123',
    );
    expect(trackingUrlFor('UPS', '1Z999')).toBe('https://www.ups.com/track?tracknum=1Z999');
  });

  /**
   * The escape hatch that makes a stale template survivable: whatever someone
   * typed while looking at the carrier's own page wins.
   */
  it('is whatever was typed, when something was typed', () => {
    expect(trackingUrlFor('DELHIVERY', 'ABC123', 'https://custom.test/x')).toBe(
      'https://custom.test/x',
    );
    // Even for a carrier with no template of its own.
    expect(trackingUrlFor('INDIA_POST', 'EE123', 'https://custom.test/x')).toBe(
      'https://custom.test/x',
    );
  });

  it('treats an empty override as absent rather than as a link to nowhere', () => {
    expect(trackingUrlFor('DELHIVERY', 'ABC123', '')).toBe(
      'https://www.delhivery.com/track/package/ABC123',
    );
    expect(trackingUrlFor('DELHIVERY', 'ABC123', '   ')).toBe(
      'https://www.delhivery.com/track/package/ABC123',
    );
  });

  /**
   * India Post has no stable link that accepts a number. Sending a shopper to
   * the carrier's tracking page with their code in hand is honest; building a
   * URL on a guess would land them on an error page that looks like the shop's
   * fault.
   */
  it('falls back to the carrier page when there is no per-parcel URL', () => {
    expect(trackingUrlFor('INDIA_POST', 'EE123456789IN')).toContain('indiapost.gov.in');
  });

  it('falls back to the carrier page when there is no consignment number yet', () => {
    expect(trackingUrlFor('DELHIVERY', null)).toBe('https://www.delhivery.com/track');
    expect(trackingUrlFor('DELHIVERY', '   ')).toBe('https://www.delhivery.com/track');
  });

  it('has nothing to offer for a self-delivered parcel', () => {
    expect(trackingUrlFor('SELF', 'ABC123')).toBeNull();
    expect(trackingUrlFor('OTHER', 'ABC123')).toBeNull();
  });

  it('has nothing to offer for a courier it does not know', () => {
    expect(trackingUrlFor('MANUAL', 'ABC123')).toBeNull();
    expect(trackingUrlFor(null, 'ABC123')).toBeNull();
  });

  /**
   * A consignment number is typed by a person and goes into a URL. A stray `&`
   * or `#` would silently truncate the query and send the shopper to a tracking
   * page for a different parcel, or none.
   */
  it('escapes a consignment number before putting it in a URL', () => {
    expect(trackingUrlFor('UPS', 'A&B C#1')).toBe(
      'https://www.ups.com/track?tracknum=A%26B%20C%231',
    );
  });

  it('produces a URL that parses, for every carrier that builds one', () => {
    for (const courier of COURIERS) {
      const url = trackingUrlFor(courier.code, 'TEST123');
      if (!url) continue;
      expect(() => new URL(url)).not.toThrow();
      expect(url.startsWith('https://')).toBe(true);
    }
  });
});
