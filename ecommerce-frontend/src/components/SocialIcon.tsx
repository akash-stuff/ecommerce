/**
 * The marks for a store's social links.
 *
 * Drawn here as inline SVG rather than taken from the icon library, because the
 * library has dropped almost all of its brand glyphs — it still ships Facebook,
 * Instagram and LinkedIn and has no X, YouTube, WhatsApp, Pinterest or Telegram
 * at all. Half a set is worse than none: a footer with two real marks and four
 * fallback globes looks broken.
 *
 * Every path is a single filled shape sized to a 24-unit box and coloured with
 * `currentColor`, so one mark can sit next to another at any size and inherit
 * whatever colour the surface around it needs.
 */

export const SOCIAL_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X',
  youtube: 'YouTube',
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  telegram: 'Telegram',
};

/** What the admin form suggests when a platform's field is empty. */
export const SOCIAL_PLACEHOLDERS: Record<string, string> = {
  instagram: 'https://instagram.com/yourstore',
  facebook: 'https://facebook.com/yourstore',
  x: 'https://x.com/yourstore',
  youtube: 'https://youtube.com/@yourstore',
  whatsapp: 'https://wa.me/919876543210',
  linkedin: 'https://linkedin.com/company/yourstore',
  pinterest: 'https://pinterest.com/yourstore',
  telegram: 'https://t.me/yourstore',
};

const PATHS: Record<string, string> = {
  instagram:
    'M12 2.2c3.2 0 3.6 0 4.9.07 1.2.05 1.8.25 2.2.42.6.22 1 .48 1.4.9.43.42.7.83.9 1.4.18.4.38 1 .43 2.2.06 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.05 1.2-.25 1.8-.42 2.2-.22.6-.48 1-.9 1.4-.42.43-.83.7-1.4.9-.4.18-1 .38-2.2.43-1.3.06-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.05-1.8-.25-2.2-.42-.6-.22-1-.48-1.4-.9-.43-.42-.7-.83-.9-1.4-.18-.4-.38-1-.43-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.05-1.2.25-1.8.42-2.2.22-.6.48-1 .9-1.4.42-.43.83-.7 1.4-.9.4-.18 1-.38 2.2-.43C8.4 2.2 8.8 2.2 12 2.2Zm0 1.8c-3.1 0-3.5 0-4.7.07-1.1.05-1.7.24-2.1.4-.5.2-.9.44-1.3.83-.4.4-.63.8-.83 1.3-.16.4-.35 1-.4 2.1C2.6 9.9 2.6 10.3 2.6 12s0 2.1.07 3.3c.05 1.1.24 1.7.4 2.1.2.5.44.9.83 1.3.4.4.8.63 1.3.83.4.16 1 .35 2.1.4 1.2.07 1.6.07 4.7.07s3.5 0 4.7-.07c1.1-.05 1.7-.24 2.1-.4.5-.2.9-.44 1.3-.83.4-.4.63-.8.83-1.3.16-.4.35-1 .4-2.1.07-1.2.07-1.6.07-3.3s0-2.1-.07-3.3c-.05-1.1-.24-1.7-.4-2.1-.2-.5-.44-.9-.83-1.3-.4-.4-.8-.63-1.3-.83-.4-.16-1-.35-2.1-.4-1.2-.07-1.6-.07-4.7-.07Zm0 3.06a4.94 4.94 0 1 1 0 9.88 4.94 4.94 0 0 1 0-9.88Zm0 1.8a3.14 3.14 0 1 0 0 6.28 3.14 3.14 0 0 0 0-6.28Zm5.15-3.2a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3Z',
  facebook:
    'M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.33V22c4.78-.76 8.44-4.92 8.44-9.94Z',
  x: 'M17.53 3h3.05l-6.66 7.61L21.75 21h-6.13l-4.8-6.28L5.32 21H2.27l7.12-8.14L2.25 3h6.28l4.34 5.74L17.53 3Zm-1.07 16.17h1.69L7.62 4.73H5.8l10.66 14.44Z',
  youtube:
    'M21.58 7.19a2.51 2.51 0 0 0-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42a2.51 2.51 0 0 0-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81a2.51 2.51 0 0 0 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42a2.51 2.51 0 0 0 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81ZM10 15.02V8.98L15.2 12 10 15.02Z',
  whatsapp:
    'M12.04 2C6.6 2 2.18 6.42 2.18 11.86c0 1.74.46 3.44 1.32 4.94L2.1 22l5.34-1.38a9.83 9.83 0 0 0 4.6 1.16h.01c5.43 0 9.85-4.42 9.85-9.86 0-2.64-1.02-5.11-2.88-6.97A9.78 9.78 0 0 0 12.04 2Zm0 1.8c2.15 0 4.17.84 5.69 2.36a7.99 7.99 0 0 1 2.36 5.7c0 4.45-3.62 8.06-8.06 8.06a8.1 8.1 0 0 1-4.11-1.12l-.3-.18-3.05.8.81-2.97-.19-.31a8.02 8.02 0 0 1-1.23-4.28c0-4.45 3.62-8.06 8.08-8.06Zm-3.4 4.2c-.16 0-.42.06-.64.3-.22.24-.85.83-.85 2.02 0 1.19.87 2.34.99 2.5.12.16 1.7 2.6 4.14 3.64.58.25 1.03.4 1.38.51.58.19 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.05.14-1.16-.06-.1-.22-.16-.46-.28-.24-.12-1.44-.71-1.66-.79-.22-.08-.38-.12-.55.12-.16.24-.63.79-.77.95-.14.16-.28.18-.52.06-.24-.12-1.03-.38-1.96-1.21-.72-.65-1.21-1.45-1.35-1.69-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.81-.2-.47-.4-.41-.55-.42h-.47Z',
  linkedin:
    'M6.94 5.5a2.06 2.06 0 1 1-4.12 0 2.06 2.06 0 0 1 4.12 0ZM3.15 8.98h3.5V21h-3.5V8.98Zm5.7 0h3.36v1.64h.05c.47-.88 1.6-1.81 3.3-1.81 3.53 0 4.18 2.32 4.18 5.34V21h-3.5v-5.85c0-1.4-.02-3.2-1.95-3.2-1.95 0-2.25 1.52-2.25 3.1V21h-3.5V8.98Z',
  pinterest:
    'M12 2C6.48 2 2 6.48 2 12c0 4.24 2.64 7.86 6.36 9.32-.09-.79-.17-2.01.03-2.88.18-.78 1.17-4.97 1.17-4.97s-.3-.6-.3-1.48c0-1.39.81-2.43 1.81-2.43.85 0 1.26.64 1.26 1.41 0 .86-.55 2.14-.83 3.33-.24 1 .5 1.81 1.48 1.81 1.78 0 3.15-1.88 3.15-4.58 0-2.4-1.72-4.07-4.18-4.07-2.85 0-4.52 2.14-4.52 4.34 0 .86.33 1.78.74 2.28.08.1.09.19.07.29-.08.32-.25 1-.28 1.14-.05.19-.15.23-.35.14-1.29-.6-2.1-2.48-2.1-4 0-3.25 2.36-6.24 6.81-6.24 3.57 0 6.35 2.55 6.35 5.95 0 3.55-2.24 6.41-5.34 6.41-1.04 0-2.02-.54-2.36-1.18l-.64 2.45c-.23.89-.86 2.01-1.28 2.69.96.3 1.98.46 3.05.46 5.52 0 10-4.48 10-10S17.52 2 12 2Z',
  telegram:
    'M21.94 4.4 18.6 20.1c-.25 1.11-.91 1.39-1.84.86l-5.08-3.75-2.45 2.36c-.27.27-.5.5-1.02.5l.36-5.17 9.4-8.5c.41-.36-.09-.56-.63-.2L5.73 13.51.73 11.95c-1.09-.34-1.11-1.09.23-1.61L20.53 2.8c.9-.34 1.7.2 1.41 1.6Z',
};

/** Anything a store saved under a name with no mark of its own. */
const FALLBACK =
  'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 6h-2.6a15.5 15.5 0 0 0-1.3-3.3A8.03 8.03 0 0 1 18.9 8ZM12 4.1c.7 1 1.3 2.3 1.7 3.9h-3.4c.4-1.6 1-2.9 1.7-3.9ZM4.3 14a8.1 8.1 0 0 1 0-4h3a17.6 17.6 0 0 0 0 4h-3Zm.8 2h2.6c.3 1.2.8 2.3 1.3 3.3A8.03 8.03 0 0 1 5.1 16Zm2.6-8H5.1a8.03 8.03 0 0 1 3.9-3.3C8.5 5.7 8 6.8 7.7 8ZM12 19.9c-.7-1-1.3-2.3-1.7-3.9h3.4c-.4 1.6-1 2.9-1.7 3.9ZM14.1 14H9.9a15.6 15.6 0 0 1 0-4h4.2a15.6 15.6 0 0 1 0 4Zm.9 5.3c.5-1 1-2.1 1.3-3.3h2.6a8.03 8.03 0 0 1-3.9 3.3Zm1.7-5.3a17.6 17.6 0 0 0 0-4h3a8.1 8.1 0 0 1 0 4h-3Z';

export function SocialIcon({
  platform,
  size = 16,
  className,
}: {
  platform: string;
  size?: number;
  className?: string;
}) {
  const path = PATHS[platform] ?? FALLBACK;

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      // Decorative: every link that uses one carries the platform name in its
      // accessible name already, so announcing the glyph too would read the
      // same word twice.
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}

/** The platform's own name, or the stored key when it is one we do not know. */
export function socialLabel(platform: string): string {
  return SOCIAL_LABELS[platform] ?? platform;
}
