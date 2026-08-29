/**
 * The couriers a shopkeeper can pick from, and where each one's tracking lives.
 *
 * A closed list rather than the free-text box this used to be. Free text meant
 * "Delhivery", "delhivery", "DELIVERY" and "Delhivary" were four carriers as far
 * as the database was concerned, none of them could produce a tracking link, and
 * the shopper got a consignment number with nothing to do with it.
 *
 * ## What a template is and is not
 *
 * `track` builds the URL a shopper follows. It is a *convenience*, not an
 * authority: carriers rearrange their sites without notice, so every shipment
 * may carry an explicit `trackingUrl` that overrides whatever this produces.
 * The admin form fills the derived URL in and lets it be edited, which means a
 * template that goes stale is a field someone corrects rather than a link that
 * silently 404s.
 *
 * A carrier with no working per-consignment URL gets `track: null` and a `site`
 * instead. That is deliberate honesty: India Post has no stable link that
 * accepts a number, so the shopper is given the carrier's tracking page and
 * their code to paste, rather than a link built on a guess that would land them
 * on an error page and look like the shop's fault.
 */
export interface Courier {
  /** Stored on the shipment. Stable — renaming one orphans existing rows. */
  code: string;
  /** What a person calls it. */
  name: string;
  /** The consignment page for one code, when the carrier has a stable one. */
  track: ((consignment: string) => string) | null;
  /** The carrier's own tracking page, for when `track` is null. */
  site: string | null;
}

/**
 * India first, because that is where this platform's stores are — INR, GST,
 * cash on delivery — then the three international carriers an Indian shop
 * actually hands parcels to.
 */
export const COURIERS: Courier[] = [
  {
    code: 'DELHIVERY',
    name: 'Delhivery',
    track: (c) => `https://www.delhivery.com/track/package/${encodeURIComponent(c)}`,
    site: 'https://www.delhivery.com/track',
  },
  {
    code: 'BLUEDART',
    name: 'Blue Dart',
    track: (c) =>
      `https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo=${encodeURIComponent(c)}`,
    site: 'https://www.bluedart.com/tracking',
  },
  {
    code: 'DTDC',
    name: 'DTDC',
    track: (c) =>
      `https://www.dtdc.in/tracking/tracking_results.asp?strCnno=${encodeURIComponent(c)}&TrkType=Consignment`,
    site: 'https://www.dtdc.in/tracking',
  },
  {
    code: 'EKART',
    name: 'Ekart',
    track: (c) => `https://ekartlogistics.com/shipmenttrack/${encodeURIComponent(c)}`,
    site: 'https://ekartlogistics.com/track',
  },
  {
    code: 'XPRESSBEES',
    name: 'XpressBees',
    track: (c) => `https://www.xpressbees.com/shipment/tracking?awb=${encodeURIComponent(c)}`,
    site: 'https://www.xpressbees.com/track',
  },
  {
    code: 'ECOM_EXPRESS',
    name: 'Ecom Express',
    track: (c) => `https://ecomexpress.in/tracking/?awb_field=${encodeURIComponent(c)}`,
    site: 'https://ecomexpress.in/tracking/',
  },
  {
    code: 'SHADOWFAX',
    name: 'Shadowfax',
    track: (c) => `https://track.shadowfax.in/#/tracking/${encodeURIComponent(c)}`,
    site: 'https://track.shadowfax.in/',
  },
  {
    code: 'SHIPROCKET',
    name: 'Shiprocket',
    track: (c) => `https://shiprocket.co/tracking/${encodeURIComponent(c)}`,
    site: 'https://shiprocket.co/tracking/',
  },
  {
    /**
     * No per-consignment URL. India Post's tracking page is a form behind a
     * session, and every "direct link" for it stops working within a year — so
     * the shopper gets the page and their number rather than a broken link.
     */
    code: 'INDIA_POST',
    name: 'India Post',
    track: null,
    site: 'https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx',
  },
  {
    code: 'FEDEX',
    name: 'FedEx',
    track: (c) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(c)}`,
    site: 'https://www.fedex.com/fedextrack/',
  },
  {
    code: 'DHL',
    name: 'DHL',
    track: (c) =>
      `https://www.dhl.com/in-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(c)}`,
    site: 'https://www.dhl.com/in-en/home/tracking.html',
  },
  {
    code: 'UPS',
    name: 'UPS',
    track: (c) => `https://www.ups.com/track?tracknum=${encodeURIComponent(c)}`,
    site: 'https://www.ups.com/track',
  },
  {
    /**
     * The shop's own van, a local man with a bike, a friend driving past. Kept
     * as a real option rather than forcing a shopkeeper to pick a carrier they
     * did not use — most small stores deliver some orders themselves, and a
     * wrong carrier on a parcel is worse than an honest "delivered by us".
     */
    code: 'SELF',
    name: 'Delivered by the store',
    track: null,
    site: null,
  },
  {
    /** Anything not on the list. The shopkeeper supplies the link themselves. */
    code: 'OTHER',
    name: 'Another courier',
    track: null,
    site: null,
  },
];

/**
 * What a dispatch records when nobody picked a courier.
 *
 * Deliberately not the column's own default of `MANUAL`: that value is a
 * schema artefact with no entry in this list, whereas `OTHER` is a real choice
 * a shopkeeper could have made and reads correctly wherever it is shown.
 */
export const DEFAULT_COURIER = 'OTHER';

export const COURIER_CODES = COURIERS.map((c) => c.code);

const BY_CODE = new Map(COURIERS.map((c) => [c.code, c]));

export function findCourier(code: string | null | undefined): Courier | null {
  return code ? BY_CODE.get(code) ?? null : null;
}

/**
 * Codes that exist in the database but must never be offered as a choice.
 *
 * `MANUAL` is the `provider` column's own default, so every shipment written
 * before this catalogue existed carries it. It is not a carrier and never was —
 * showing a shopper "MANUAL" would be leaking a schema default into a sentence
 * about their parcel. Kept out of `COURIERS` so it cannot be picked, and
 * translated here so the rows that have it still read properly.
 */
const LEGACY_NAMES: Record<string, string> = {
  MANUAL: 'Courier',
};

/**
 * What a person should see.
 *
 * Falls through to the stored value for anything unrecognised, because the
 * column used to be free text: a row saying "Delhivary" is a typo worth showing
 * back, not a reason to print nothing.
 */
export function courierName(code: string | null | undefined): string {
  if (!code) return 'Courier';
  return findCourier(code)?.name ?? LEGACY_NAMES[code] ?? code;
}

/**
 * The link a shopper follows, or null.
 *
 * An explicit URL always wins: it is what someone typed while looking at the
 * carrier's own page, and it is the escape hatch for every template here going
 * stale. Falling back to the carrier's tracking page — rather than to nothing —
 * means a shopper with a consignment number always has somewhere to take it.
 */
export function trackingUrlFor(
  code: string | null | undefined,
  consignment: string | null | undefined,
  explicit?: string | null,
): string | null {
  if (explicit && explicit.trim() !== '') return explicit.trim();

  const courier = findCourier(code);
  if (!courier) return null;

  const trimmed = consignment?.trim();
  if (trimmed && courier.track) return courier.track(trimmed);

  return courier.site;
}
