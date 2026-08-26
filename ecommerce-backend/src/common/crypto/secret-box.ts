import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Symmetric encryption for third-party credentials held on a tenant's behalf.
 *
 * A store's Razorpay key secret is not our secret to lose. It is not a password
 * — we have to send the original value to the gateway, so it cannot be hashed —
 * which leaves authenticated encryption, with the key outside the database. A
 * dump of `payment_gateways` then yields nothing usable without also having the
 * application environment.
 *
 * AES-256-GCM rather than CBC: GCM authenticates the ciphertext, so a tampered
 * envelope fails to open instead of decrypting to attacker-chosen bytes. The
 * `aad` binds an envelope to where it was stored, so a ciphertext lifted from
 * one tenant's row and pasted into another's fails to open even though the key
 * is the same.
 */

/** What gets stored. Versioned so the scheme can be changed without guessing. */
export interface SealedSecret {
  v: 1;
  /** Base64. 12 bytes, as GCM specifies. */
  iv: string;
  /** Base64 ciphertext. */
  ct: string;
  /** Base64 GCM authentication tag. */
  tag: string;
}

const IV_BYTES = 12;
const KEY_BYTES = 32;

export class SecretBox {
  private readonly key: Buffer;

  /**
   * @param key 32 bytes, base64 or hex. Anything else is refused at
   *   construction rather than at the first encrypt, so a misconfigured
   *   deployment fails at boot.
   */
  constructor(key: string) {
    this.key = decodeKey(key);
  }

  seal(plaintext: string, aad: string): SealedSecret {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));

    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return {
      v: 1,
      iv: iv.toString('base64'),
      ct: ct.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
  }

  /**
   * Throws if the envelope was tampered with, encrypted under a different key,
   * or bound to different `aad`. All four failures are the same answer — this
   * value cannot be trusted — so they are not distinguished.
   */
  open(sealed: SealedSecret, aad: string): string {
    if (sealed?.v !== 1) {
      throw new Error(`Unsupported sealed-secret version: ${String(sealed?.v)}`);
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(sealed.iv, 'base64'),
    );
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(sealed.ct, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}

/** True for something shaped like an envelope, without trying to open it. */
export function isSealedSecret(value: unknown): value is SealedSecret {
  const v = value as SealedSecret | null;
  return Boolean(
    v && typeof v === 'object' &&
    v.v === 1 &&
    typeof v.iv === 'string' &&
    typeof v.ct === 'string' &&
    typeof v.tag === 'string',
  );
}

function decodeKey(key: string): Buffer {
  const trimmed = (key ?? '').trim();
  if (!trimmed) {
    throw new Error('An encryption key is required.');
  }

  // Hex first: a 64-character hex string is also valid base64, and would decode
  // to 48 bytes of nonsense rather than the 32 bytes intended.
  const decoded = /^[0-9a-f]{64}$/i.test(trimmed)
    ? Buffer.from(trimmed, 'hex')
    : Buffer.from(trimmed, 'base64');

  if (decoded.length !== KEY_BYTES) {
    throw new Error(
      `An encryption key must be ${KEY_BYTES} bytes; got ${decoded.length}. ` +
        'Generate one with: openssl rand -base64 32',
    );
  }

  return decoded;
}
