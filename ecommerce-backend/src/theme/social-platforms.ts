/**
 * The social networks a store may link to.
 *
 * The storefront draws each of these as its own mark rather than as the word
 * "instagram", so the list is closed: a platform with no mark would render as a
 * generic globe, which looks like a bug rather than a link. The admin editor is
 * offered exactly this list through `/theme/options`.
 *
 * Existing rows are *not* filtered against it on read. A store that already had
 * a link saved under some other key keeps it and gets the fallback mark —
 * silently dropping a link someone put there would be worse than showing a
 * generic icon.
 */
export const SOCIAL_PLATFORMS = [
  'instagram',
  'facebook',
  'x',
  'youtube',
  'whatsapp',
  'linkedin',
  'pinterest',
  'telegram',
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
