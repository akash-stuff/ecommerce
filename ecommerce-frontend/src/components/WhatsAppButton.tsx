import { useLocation } from 'react-router-dom';
import { useStore } from '@/features/theme/ThemeProvider';

/**
 * The WhatsApp chat button, bottom right of every storefront page.
 *
 * Opt-in per shop: it renders nothing until a shopkeeper fills in a WhatsApp
 * number under Settings. Falling back to the shop's contact `phone` was
 * tempting and wrong — that field is routinely a landline or a switchboard, and
 * a chat button that opens a conversation nobody can answer costs a shop more
 * than having no button at all.
 *
 * Deliberately WhatsApp's own green rather than the shop's brand colour. This
 * is a recognised mark and shoppers identify it by colour before they read it;
 * a maroon one on a maroon shop is a button nobody notices.
 */

/** WhatsApp brand green, and the darker step for its hover. */
const WHATSAPP = '#25D366';
const WHATSAPP_DARK = '#1EBE5A';

/**
 * `wa.me` wants digits only — no `+`, spaces, brackets or dashes.
 *
 * A shopkeeper types the number however they say it out loud, so this is
 * normalised at the point of use rather than at the point of entry: storing
 * what they typed keeps the Settings field showing their own formatting, which
 * is what makes it checkable at a glance.
 */
function toWaNumber(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function WhatsAppButton() {
  const store = useStore();
  const { pathname } = useLocation();

  const digits = store.whatsappNumber ? toWaNumber(store.whatsappNumber) : '';
  // A number too short to dial is a typo, not a number. Rendering a button for
  // it would open a WhatsApp error page in a new tab.
  if (digits.length < 8) return null;

  /**
   * Not shown during checkout.
   *
   * A floating button over the payment step is a distraction at the one moment
   * the shopper should not be distracted, and on a phone it sits on top of the
   * pay button. Support questions belong before that step or after it.
   */
  if (pathname.startsWith('/checkout')) return null;

  const message = `Hello ${store.name}, I have a question about`;
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`Chat with ${store.name} on WhatsApp`}
      style={{ backgroundColor: WHATSAPP }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = WHATSAPP_DARK;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = WHATSAPP;
      }}
      className={
        // `bottom-5 right-5` on a phone and further in on a desktop. z-30 keeps
        // it under the header (z-40) and under any dialog, so it can never sit
        // on top of something a shopper is trying to read.
        'group fixed bottom-5 right-5 z-30 inline-flex items-center gap-2.5 rounded-full ' +
        'py-3 pl-3 pr-3 text-white shadow-lifted transition-all duration-300 ' +
        'hover:pr-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ' +
        'focus-visible:ring-offset-2 sm:bottom-7 sm:right-7'
      }
    >
      <WhatsAppMark />
      {/*
        The label expands on hover on a pointer device and is never shown on a
        phone, where there is no hover and the mark alone is unmistakable.
        `max-width` rather than `display`, so the width animates.
      */}
      <span className="hidden max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium transition-[max-width] duration-300 group-hover:max-w-[10rem] sm:inline-block">
        Chat with us
      </span>
    </a>
  );
}

/**
 * WhatsApp's glyph, drawn rather than imported.
 *
 * lucide has no WhatsApp icon — its brand set was removed — and pulling a whole
 * icon package in for one mark is not worth the bytes.
 */
function WhatsAppMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.4-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.23 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.42-.07-.13-.27-.2-.57-.35Z" />
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2 22l5.25-1.38a9.86 9.86 0 0 0 4.78 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm0 18.02h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.37c0-4.54 3.7-8.23 8.24-8.23a8.24 8.24 0 0 1 0 16.46Z" />
    </svg>
  );
}
