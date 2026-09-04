import { PrismaService } from '../common/prisma/prisma.service';
import { MAX_PROMISES, PROMISE_ICONS } from '../theme/dto/theme.dto';

/**
 * The handful of things a shop can honestly promise a shopper before they have
 * put anything in a basket.
 *
 * Every field is derived from configuration the shopkeeper already filled in
 * for another purpose — shipping zones, methods and the WhatsApp number — and
 * nothing here is a default, a placeholder or a claim this codebase invented.
 * That matters more than it sounds: a trust strip is the one part of a
 * storefront that is pure assertion, and the usual way it gets built is a
 * theme hard-coding "Free shipping · Easy returns · 100% authentic" on behalf
 * of a shop that offers none of those. Anything not configured is absent, and
 * the storefront draws no tile for it.
 */
export interface StorePromises {
  /**
   * The lowest order value that earns free delivery on any active method, as a
   * decimal string. Null when no method offers it.
   *
   * The lowest rather than the highest: it is the threshold a shopper can
   * actually reach, and quoting the dearest zone's number would understate
   * what most of them get.
   */
  freeShippingAbove: string | null;
  /** True when at least one active method takes cash on delivery. */
  codAvailable: boolean;
  /** The fastest active method's quoted range. Null when none states one. */
  minDeliveryDays: number | null;
  maxDeliveryDays: number | null;
}

export const NO_PROMISES: StorePromises = {
  freeShippingAbove: null,
  codAvailable: false,
  minDeliveryDays: null,
  maxDeliveryDays: null,
};

/**
 * Read across every active method in every active zone.
 *
 * Deliberately not per-zone: this is read on the homepage, before anyone has
 * given an address, so there is no zone to pick. What can be said without one
 * is "some delivery option here does this", which is why the free-shipping
 * threshold is the minimum and the delivery window is the fastest — both are
 * the claim a shopper is most likely to find true when they reach checkout.
 *
 * Never throws. A trust strip must not be able to fail a storefront.
 */
export async function resolveStorePromises(prisma: PrismaService): Promise<StorePromises> {
  try {
    const methods = await prisma.db.shippingMethod.findMany({
      where: { isActive: true, zone: { isActive: true } },
      select: {
        freeAboveAmount: true,
        codAvailable: true,
        minDeliveryDays: true,
        maxDeliveryDays: true,
      },
    });

    if (methods.length === 0) return NO_PROMISES;

    const thresholds = methods
      .map((m) => m.freeAboveAmount)
      .filter((v): v is NonNullable<typeof v> => v !== null);

    // Prisma returns Decimal; compared as numbers and returned as the string
    // the rest of the money surface uses, so precision survives the wire.
    const lowest = thresholds.reduce<(typeof thresholds)[number] | null>(
      (best, v) => (best === null || Number(v) < Number(best) ? v : best),
      null,
    );

    // The fastest method, judged on when it *starts* arriving. A method with no
    // stated range says nothing rather than counting as instant.
    const quoted = methods.filter((m) => m.minDeliveryDays !== null);
    const fastest = quoted.reduce<(typeof quoted)[number] | null>(
      (best, m) => (best === null || m.minDeliveryDays! < best.minDeliveryDays! ? m : best),
      null,
    );

    return {
      freeShippingAbove: lowest === null ? null : lowest.toString(),
      codAvailable: methods.some((m) => m.codAvailable),
      minDeliveryDays: fastest?.minDeliveryDays ?? null,
      maxDeliveryDays: fastest?.maxDeliveryDays ?? null,
    };
  } catch {
    return NO_PROMISES;
  }
}

/** One tile as the shopkeeper wrote it. */
export interface PromiseRow {
  icon: string;
  title: string;
  detail: string;
}

/**
 * The tiles the storefront should draw, as text.
 *
 * Authored rows win outright when there are any. The derived strip is the
 * default a shop gets before it has said anything, not a set of extras to be
 * merged in underneath — mixing the two would mean editing one row silently
 * changed what the others said, and a shopkeeper who deleted "Cash on
 * delivery" would watch it come back.
 */
export function toPromiseRows(
  authored: unknown,
  derived: StorePromises,
  currency: string,
): PromiseRow[] {
  const written = readAuthored(authored);
  return written.length > 0 ? written : deriveRows(derived, currency);
}

/**
 * Read back what was stored, defensively.
 *
 * This is a JSON column, so the shape is whatever was written into it — by this
 * build, by an older one, by a seed or by hand. Anything that is not a
 * well-formed row is dropped rather than rendered, because the failure mode on
 * a storefront is a tile with a blank line in it that the shopkeeper cannot
 * find the setting for.
 */
function readAuthored(value: unknown): PromiseRow[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row) => ({
      icon: typeof row.icon === 'string' ? row.icon : '',
      title: typeof row.title === 'string' ? row.title.trim() : '',
      detail: typeof row.detail === 'string' ? row.detail.trim() : '',
    }))
    .filter(
      (row) =>
        row.title !== '' &&
        row.detail !== '' &&
        (PROMISE_ICONS as readonly string[]).includes(row.icon),
    )
    .slice(0, MAX_PROMISES);
}

/** The strip a shop gets for free, worded from its own shipping settings. */
function deriveRows(p: StorePromises, currency: string): PromiseRow[] {
  const rows: PromiseRow[] = [];

  if (p.freeShippingAbove) {
    rows.push({
      icon: 'truck',
      title: 'Free delivery',
      detail: `On orders over ${money(p.freeShippingAbove, currency)}`,
    });
  }

  if (p.minDeliveryDays) {
    const range =
      p.maxDeliveryDays && p.maxDeliveryDays !== p.minDeliveryDays
        ? `${p.minDeliveryDays}–${p.maxDeliveryDays} days`
        : `${p.minDeliveryDays} ${p.minDeliveryDays === 1 ? 'day' : 'days'}`;
    rows.push({ icon: 'clock', title: 'Fast dispatch', detail: `Delivered in ${range}` });
  }

  if (p.codAvailable) {
    rows.push({
      icon: 'rupee',
      title: 'Cash on delivery',
      detail: 'Pay when your order arrives',
    });
  }

  return rows;
}

/**
 * "₹5,000", not "₹5,000.00".
 *
 * Formatted here rather than in the browser because the authored rows are
 * already finished strings, and a strip where one tile was worded server-side
 * and the next client-side would drift apart the first time either changed.
 */
function money(amount: string, currency: string): string {
  const value = Number(amount);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(Number.isFinite(value) ? value : 0);
}
