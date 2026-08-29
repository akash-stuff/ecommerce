/**
 * Saves a blob the app already has in memory.
 *
 * Files that need a bearer token cannot be reached with a plain `<a href>` —
 * the browser sends no Authorization header on a navigation, so the request
 * lands on the login page and the shopper downloads an HTML error instead of
 * their invoice. Fetching first and saving from memory is what makes an
 * authenticated download work at all.
 *
 * The object URL is revoked on the next frame rather than immediately: some
 * browsers have not started reading the blob when `click()` returns, and
 * revoking too early cancels the save.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The filename the server asked for, when it asked for one.
 *
 * The invoice route sets `Content-Disposition: attachment; filename="…"`, and
 * that name is the store's own invoice number — better than one the browser
 * invents. It is only trusted as far as its own basename: a header is written
 * by the server, but `download` is a local file path and a `..` in it has no
 * business reaching the disk.
 */
export function filenameFromDisposition(
  disposition: string | undefined,
  fallback: string,
): string {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? '');
  if (!match) return fallback;

  const name = decodeURIComponent(match[1]).split(/[\\/]/).pop()?.trim();
  return name && name !== '.' && name !== '..' ? name : fallback;
}
