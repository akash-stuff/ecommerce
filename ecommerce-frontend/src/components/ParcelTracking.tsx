import { CheckCircle2, PackageCheck, RotateCcw, Truck, XCircle } from 'lucide-react';
import type { Shipment } from '@/types/api';

/**
 * Where a shopper's parcel is.
 *
 * Shown on their own orders, which is the one place they will look for it.
 * Before this, a dispatch email carried a tracking number and the account page
 * carried nothing, so anyone who deleted the email had no way back to it —
 * which is the moment they email the shop to ask, and the shop has to look it
 * up by hand.
 *
 * The courier's name is resolved here rather than sent by the API because the
 * stored value is a code: `ECOM_EXPRESS` is a database value, not something to
 * put in front of a customer. A code this list does not know is shown as
 * stored, which is what rows written before the courier catalogue existed
 * carry.
 */
const COURIER_NAMES: Record<string, string> = {
  DELHIVERY: 'Delhivery',
  BLUEDART: 'Blue Dart',
  DTDC: 'DTDC',
  EKART: 'Ekart',
  XPRESSBEES: 'XpressBees',
  ECOM_EXPRESS: 'Ecom Express',
  SHADOWFAX: 'Shadowfax',
  SHIPROCKET: 'Shiprocket',
  INDIA_POST: 'India Post',
  FEDEX: 'FedEx',
  DHL: 'DHL',
  UPS: 'UPS',
  SELF: 'Delivered by the store',
  OTHER: 'Courier',
  /**
   * Not a carrier: it is the `provider` column's own default, so every parcel
   * recorded before the courier list existed carries it. Translated rather than
   * shown, because "MANUAL" in a sentence about someone's parcel is a schema
   * default that has escaped.
   */
  MANUAL: 'Courier',
};

export function courierLabel(code: string): string {
  return COURIER_NAMES[code] ?? code;
}

/** What each parcel state says, and the mark that goes with it. */
const STATE: Record<
  string,
  { label: string; icon: typeof Truck; tone: string }
> = {
  PENDING: { label: 'Getting ready', icon: PackageCheck, tone: 'text-ink-500' },
  LABEL_CREATED: { label: 'Label created', icon: PackageCheck, tone: 'text-ink-500' },
  IN_TRANSIT: { label: 'On its way', icon: Truck, tone: 'text-blue-600' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', icon: Truck, tone: 'text-blue-600' },
  DELIVERED: { label: 'Delivered', icon: CheckCircle2, tone: 'text-green-600' },
  FAILED: { label: 'Delivery failed', icon: XCircle, tone: 'text-red-600' },
  RETURNED: { label: 'Returned', icon: RotateCcw, tone: 'text-amber-600' },
};

export function ParcelTracking({ shipments }: { shipments: Shipment[] }) {
  if (shipments.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      {shipments.map((parcel) => {
        const state = STATE[parcel.status] ?? {
          label: parcel.status.toLowerCase().replace(/_/g, ' '),
          icon: Truck,
          tone: 'text-ink-500',
        };
        const Icon = state.icon;

        return (
          <div
            key={parcel.id}
            className="rounded-card border border-ink-100 bg-ink-50/60 px-4 py-3"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Icon size={15} className={state.tone} />
              <span className="text-sm font-medium text-ink-900">{state.label}</span>
              <span className="text-sm text-ink-500">
                · {courierLabel(parcel.provider)}
              </span>
            </div>

            {parcel.trackingNumber && (
              <p className="mt-1.5 text-xs text-ink-500">
                Consignment{' '}
                {/* Selectable as one run, because the next thing anyone does
                    with a tracking number is copy it. */}
                <span className="select-all font-mono text-ink-900">
                  {parcel.trackingNumber}
                </span>
              </p>
            )}

            {parcel.trackingUrl && (
              <a
                href={parcel.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand underline"
              >
                Track this parcel
              </a>
            )}

            {/* Said plainly rather than left as an absent link. A shopper with a
                number and no link should be told to take it to the courier,
                not left wondering whether the page is broken. */}
            {!parcel.trackingUrl && parcel.trackingNumber && (
              <p className="mt-1.5 text-xs text-ink-500">
                Use this number on {courierLabel(parcel.provider)}&apos;s own tracking page.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
