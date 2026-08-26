import { randomBytes } from 'node:crypto';
import { SecretBox, isSealedSecret } from '../src/common/crypto/secret-box';

const KEY = randomBytes(32).toString('base64');
const OTHER_KEY = randomBytes(32).toString('base64');

const AAD = 'paymentGateway:tenant-a:RAZORPAY:keySecret';

/**
 * These envelopes hold credentials that belong to tenants, not to us — a store's
 * Razorpay key secret can move money out of that store's account. The
 * properties below are what make a database dump on its own useless, and what
 * stops a row copied between tenants from silently working.
 */
describe('SecretBox', () => {
  const box = new SecretBox(KEY);

  it('round-trips a value', () => {
    const sealed = box.seal('rzp_secret_value', AAD);
    expect(box.open(sealed, AAD)).toBe('rzp_secret_value');
  });

  it('never stores the plaintext in the envelope', () => {
    const sealed = box.seal('rzp_secret_value', AAD);
    expect(JSON.stringify(sealed)).not.toContain('rzp_secret_value');
  });

  /**
   * Two envelopes of the same value must differ, or an observer can tell that
   * two stores entered the same secret — and that a secret was re-entered
   * unchanged.
   */
  it('produces a different envelope every time', () => {
    const a = box.seal('same', AAD);
    const b = box.seal('same', AAD);
    expect(a.ct).not.toBe(b.ct);
    expect(a.iv).not.toBe(b.iv);
    expect(box.open(a, AAD)).toBe(box.open(b, AAD));
  });

  it('refuses an envelope sealed under a different key', () => {
    const sealed = new SecretBox(OTHER_KEY).seal('value', AAD);
    expect(() => box.open(sealed, AAD)).toThrow();
  });

  /**
   * The reason `aad` carries the tenant id. One key encrypts every tenant's
   * secrets, so without binding, an envelope written into another store's row
   * would decrypt cleanly and point that store's payments at the wrong
   * merchant account.
   */
  it("refuses an envelope bound to another tenant's row", () => {
    const sealed = box.seal('value', 'paymentGateway:tenant-a:RAZORPAY:keySecret');
    expect(() =>
      box.open(sealed, 'paymentGateway:tenant-b:RAZORPAY:keySecret'),
    ).toThrow();
  });

  it('refuses an envelope bound to a different field of the same row', () => {
    const sealed = box.seal('value', 'paymentGateway:tenant-a:RAZORPAY:keySecret');
    expect(() =>
      box.open(sealed, 'paymentGateway:tenant-a:RAZORPAY:webhookSecret'),
    ).toThrow();
  });

  /** GCM authenticates, so a flipped byte is detected rather than decrypted. */
  it('refuses a tampered ciphertext', () => {
    const sealed = box.seal('value', AAD);
    const bytes = Buffer.from(sealed.ct, 'base64');
    bytes[0] ^= 0xff;

    expect(() => box.open({ ...sealed, ct: bytes.toString('base64') }, AAD)).toThrow();
  });

  it('refuses a tampered authentication tag', () => {
    const sealed = box.seal('value', AAD);
    const tag = Buffer.from(sealed.tag, 'base64');
    tag[0] ^= 0xff;

    expect(() => box.open({ ...sealed, tag: tag.toString('base64') }, AAD)).toThrow();
  });

  it('refuses an envelope from an unknown scheme version', () => {
    const sealed = box.seal('value', AAD);
    expect(() => box.open({ ...sealed, v: 2 as unknown as 1 }, AAD)).toThrow(/version/);
  });

  it('handles unicode and long values', () => {
    const value = '🔐 ' + 'x'.repeat(4096) + ' ünïcodé';
    expect(box.open(box.seal(value, AAD), AAD)).toBe(value);
  });

  it('handles the empty string, which is distinct from no secret at all', () => {
    expect(box.open(box.seal('', AAD), AAD)).toBe('');
  });
});

/**
 * Key handling is checked at construction so a misconfigured deployment fails
 * at boot rather than when the first shopkeeper saves a gateway key.
 */
describe('SecretBox key validation', () => {
  it('accepts 32 bytes as base64 or as hex', () => {
    const raw = randomBytes(32);
    expect(() => new SecretBox(raw.toString('base64'))).not.toThrow();
    expect(() => new SecretBox(raw.toString('hex'))).not.toThrow();
  });

  /**
   * 64 hex characters are also valid base64, and would decode to 48 bytes of
   * something else. Reading hex first is what makes both forms mean the same
   * key rather than two different ones.
   */
  it('reads a 64-character hex key as hex, not as base64', () => {
    const raw = randomBytes(32);
    const viaHex = new SecretBox(raw.toString('hex'));
    const viaBase64 = new SecretBox(raw.toString('base64'));

    const sealed = viaHex.seal('value', AAD);
    expect(viaBase64.open(sealed, AAD)).toBe('value');
  });

  it('refuses a key that is the wrong length', () => {
    expect(() => new SecretBox(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
    expect(() => new SecretBox(randomBytes(64).toString('base64'))).toThrow(/32 bytes/);
    // A 32-*character* passphrase is only 24 bytes decoded — the mistake the
    // boot-time check exists to catch.
    expect(() => new SecretBox('a'.repeat(32))).toThrow(/32 bytes/);
  });

  it('refuses a missing key', () => {
    expect(() => new SecretBox('')).toThrow(/required/);
    expect(() => new SecretBox('   ')).toThrow(/required/);
  });
});

describe('isSealedSecret', () => {
  it('recognises an envelope without opening it', () => {
    expect(isSealedSecret(new SecretBox(KEY).seal('v', AAD))).toBe(true);
  });

  /**
   * Guards the read path: a row holding something other than an envelope — a
   * hand-edited value, or a leftover from an older scheme — is treated as "not
   * configured" rather than crashing a shopper's checkout.
   */
  it('rejects anything else', () => {
    for (const value of [
      null,
      undefined,
      'a string',
      42,
      [],
      {},
      { v: 1, iv: 'x', ct: 'y' },
      { v: 2, iv: 'x', ct: 'y', tag: 'z' },
      { v: 1, iv: 1, ct: 'y', tag: 'z' },
    ]) {
      expect(isSealedSecret(value)).toBe(false);
    }
  });
});
