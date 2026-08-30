import { lookup } from 'node:dns/promises';
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { join, normalize, resolve, sep } from 'node:path';
import { Logger } from '@nestjs/common';
import { detectImageType } from '../media/image-type';

/**
 * Loading a store's logo so it can be drawn on an invoice.
 *
 * This file exists because the obvious implementation is a security hole. The
 * invoice renderer originally embedded no logo at all, and said why: putting
 * `theme.logoUrl` into a server-side request means the API fetches a URL held
 * in the database, and that URL is not ours. A shopkeeper can paste any address
 * into the logo field — the upload widget offers a "paste a URL" box — so the
 * naive version is a request-forgery primitive aimed at the inside of our own
 * network, with `http://169.254.169.254/latest/meta-data/` as the first thing
 * anyone would try.
 *
 * So the logo is loaded through two narrow doors and no others.
 *
 * ## Door one: our own disk
 *
 * The default deployment stores uploads locally and serves them from this API's
 * own address. When the URL is one of ours, the bytes are read straight off the
 * disk and no request is made at all. This is both the safest path and the
 * common one, and it is why a local install gets a logo on its invoices without
 * any of the network machinery below ever running.
 *
 * ## Door two: a public HTTPS address
 *
 * For an S3 or CDN deployment the file genuinely is remote. That fetch is
 * guarded: HTTPS only, the hostname resolved and checked against every private
 * range before connecting, redirects refused outright, a short timeout, and a
 * hard byte cap enforced while reading rather than trusted from a header.
 *
 * ## It never throws
 *
 * Every failure returns null and the invoice draws its wordmark instead. An
 * invoice is a financial document someone is trying to download; it must not
 * fail because a logo host was slow.
 */

const logger = new Logger('StoreLogo');

/** Long enough for a CDN, short enough not to hold an invoice hostage. */
const TIMEOUT_MS = 3_000;

/**
 * A logo is a wordmark, not a photograph. Two megabytes is already generous,
 * and the cap is what stops a hostile host streaming gigabytes into memory.
 */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * pdfkit embeds PNG and JPEG and nothing else.
 *
 * Checked by magic bytes rather than by `Content-Type`, which is a claim made
 * by whoever served the file. An SVG that says it is a PNG would otherwise
 * reach the renderer and throw mid-document.
 */
const EMBEDDABLE = new Set(['image/png', 'image/jpeg']);

export interface LogoSource {
  /** `theme.logoUrl`, as stored. */
  url: string | null | undefined;
  /** `storage.publicBaseUrl` — where this deployment's own uploads are served. */
  publicBaseUrl: string | null | undefined;
  /** `storage.localDir`, resolved. Where those files actually live. */
  localDir: string | null | undefined;
}

export async function loadStoreLogo(source: LogoSource): Promise<Buffer | null> {
  const raw = source.url?.trim();
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  try {
    const bytes =
      (await fromLocalDisk(parsed, source)) ?? (await fromRemote(parsed));

    if (!bytes) return null;

    const type = detectImageType(bytes);
    if (!type || !EMBEDDABLE.has(type.contentType)) {
      logger.warn(
        `Store logo at ${parsed.host} is ${type?.contentType ?? 'not an image'}; ` +
          'only PNG and JPEG can be drawn into a PDF.',
      );
      return null;
    }

    return bytes;
  } catch (error) {
    // Never fatal: the invoice falls back to the store's name in type.
    logger.warn(`Could not load the store logo: ${(error as Error).message}`);
    return null;
  }
}

/**
 * The file, if this URL is one this deployment serves itself.
 *
 * Returns null — rather than throwing — when the URL belongs to somebody else,
 * so the caller falls through to the network path.
 */
async function fromLocalDisk(url: URL, source: LogoSource): Promise<Buffer | null> {
  const base = source.publicBaseUrl?.trim();
  const dir = source.localDir?.trim();
  if (!base || !dir) return null;

  let baseUrl: URL;
  try {
    baseUrl = new URL(base);
  } catch {
    return null;
  }

  // Same origin *and* under /uploads: the only shape the local provider writes.
  if (url.origin !== baseUrl.origin) return null;
  if (!url.pathname.startsWith('/uploads/')) return null;

  const key = decodeURIComponent(url.pathname.slice('/uploads/'.length));
  const root = resolve(dir);
  const path = resolve(join(root, normalize(key)));

  /**
   * The same containment check the local provider makes on the way in, made
   * again on the way out. A key with `..` in it would otherwise read any file
   * the process can — and this key came out of the database, not out of the
   * upload path that sanitised it.
   */
  if (path !== root && !path.startsWith(root + sep)) {
    logger.warn('Refused a store logo whose path escapes the upload directory.');
    return null;
  }

  return readFile(path).catch(() => null);
}

/** Everything Node hands us for a hostname, as plain addresses. */
async function addressesFor(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  const results = await lookup(hostname, { all: true });
  return results.map((r) => r.address);
}

/**
 * True for anything that is not a public internet address.
 *
 * Loopback, the RFC 1918 ranges, carrier-grade NAT, link-local — which is where
 * cloud metadata services live and is the single most valuable target for this
 * class of bug — and the IPv6 equivalents.
 */
export function isPrivateAddress(address: string): boolean {
  const v = address.toLowerCase();

  if (v === '::' || v === '::1') return true;
  // IPv4 written inside an IPv6 wrapper still reaches an IPv4 host.
  const mapped = v.startsWith('::ffff:') ? v.slice(7) : v;

  if (isIP(mapped) === 4) {
    const [a, b] = mapped.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast and reserved
    return false;
  }

  // Unique-local (fc00::/7) and link-local (fe80::/10).
  return /^f[cd]/.test(mapped) || /^fe[89ab]/.test(mapped);
}

/** Fetches a remote logo, or refuses. */
async function fromRemote(url: URL): Promise<Buffer | null> {
  /**
   * HTTPS only. An `http` logo is a plaintext fetch this server makes on a
   * schedule an attacker chooses, and the one legitimate `http` case — a local
   * deployment serving its own uploads — went through the disk door above.
   */
  if (url.protocol !== 'https:') {
    logger.warn(`Refused a store logo over ${url.protocol}//; HTTPS only.`);
    return null;
  }

  const addresses = await addressesFor(url.hostname);
  if (addresses.length === 0) return null;

  /**
   * Every address, not just the first. A hostname that resolves to one public
   * and one private address would otherwise be a coin flip, and the attacker
   * gets to flip it as often as they like.
   */
  const blocked = addresses.filter(isPrivateAddress);
  if (blocked.length > 0) {
    logger.warn(
      `Refused a store logo at ${url.hostname}: resolves to a private address (${blocked[0]}).`,
    );
    return null;
  }

  const response = await fetch(url, {
    // Refused rather than followed: a public host may redirect to a private
    // one, and re-checking every hop is more surface than this is worth.
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: 'image/png,image/jpeg' },
  });

  if (!response.ok || !response.body) return null;

  /**
   * Read in chunks against a running total. `Content-Length` is a claim; a
   * hostile host can omit it and stream until the process runs out of memory.
   */
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.length;
    if (total > MAX_BYTES) {
      logger.warn(`Store logo at ${url.hostname} exceeds ${MAX_BYTES} bytes; ignored.`);
      return null;
    }
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}
