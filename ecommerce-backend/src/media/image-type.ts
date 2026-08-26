/**
 * Identifies an image from its bytes.
 *
 * The multipart `Content-Type` and the filename are both supplied by whoever is
 * uploading, so neither can decide what a file *is*. A `.png` that is really an
 * HTML document, served back from the store's own origin, is stored XSS. The
 * signature check is what makes the stored content-type trustworthy.
 *
 * SVG is deliberately absent. It is XML that may contain `<script>` and event
 * handlers, so serving one from the storefront's origin hands an attacker
 * script execution there. Supporting it safely needs a sanitiser, which is a
 * larger piece of work than pretending the format is a picture.
 */

export interface ImageType {
  extension: string;
  contentType: string;
}

const SIGNATURES: { type: ImageType; matches: (b: Buffer) => boolean }[] = [
  {
    type: { extension: 'jpg', contentType: 'image/jpeg' },
    matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    type: { extension: 'png', contentType: 'image/png' },
    matches: (b) =>
      b.length > 8 &&
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    type: { extension: 'gif', contentType: 'image/gif' },
    matches: (b) =>
      b.length > 6 &&
      (b.subarray(0, 6).toString('ascii') === 'GIF87a' ||
        b.subarray(0, 6).toString('ascii') === 'GIF89a'),
  },
  {
    // RIFF container with a WEBP fourcc at byte 8 — "RIFF" alone is also WAV.
    type: { extension: 'webp', contentType: 'image/webp' },
    matches: (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

/** The image this actually is, or null if it is not one we serve. */
export function detectImageType(bytes: Buffer): ImageType | null {
  return SIGNATURES.find((s) => s.matches(bytes))?.type ?? null;
}

export const SUPPORTED_IMAGE_TYPES = SIGNATURES.map((s) => s.type.contentType);
