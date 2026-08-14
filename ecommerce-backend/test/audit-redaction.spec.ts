import { redact } from '../src/audit/audit.service';

/**
 * An audit log is readable by anyone with audit access. A trail that records the
 * secret being changed turns that log into a credential store, which is worse
 * than having no trail at all.
 */
describe('audit redaction', () => {
  it('redacts a password but keeps the fact it changed', () => {
    const out = redact({ email: 'a@b.com', password: 'hunter2' }) as Record<string, unknown>;
    expect(out.email).toBe('a@b.com');
    expect(out.password).toBe('[redacted]');
  });

  it('matches on substrings, not exact names', () => {
    const out = redact({
      passwordHash: 'x',
      newPassword: 'y',
      refreshToken: 'z',
      webhookSecret: 'w',
      apiKey: 'k',
      cardNumber: '4111111111111111',
      cvv: '123',
    }) as Record<string, string>;

    for (const value of Object.values(out)) expect(value).toBe('[redacted]');
  });

  it('is case-insensitive about the key', () => {
    const out = redact({ PASSWORD: 'x', Secret: 'y' }) as Record<string, string>;
    expect(out.PASSWORD).toBe('[redacted]');
    expect(out.Secret).toBe('[redacted]');
  });

  /** Before/after diffs nest, which is exactly where a secret would hide. */
  it('reaches secrets nested inside a diff', () => {
    const out = redact({
      before: { name: 'Old', passwordHash: 'a' },
      after: { name: 'New', passwordHash: 'b' },
    }) as { before: Record<string, string>; after: Record<string, string> };

    expect(out.before.name).toBe('Old');
    expect(out.before.passwordHash).toBe('[redacted]');
    expect(out.after.passwordHash).toBe('[redacted]');
  });

  it('walks arrays too', () => {
    const out = redact({ users: [{ email: 'a@b.com', token: 't' }] }) as {
      users: Record<string, string>[];
    };
    expect(out.users[0].email).toBe('a@b.com');
    expect(out.users[0].token).toBe('[redacted]');
  });

  it('leaves ordinary values alone', () => {
    expect(redact({ delta: -5, reason: 'SALE', note: null })).toEqual({
      delta: -5,
      reason: 'SALE',
      note: null,
    });
  });

  it('survives nulls and primitives', () => {
    expect(redact(null)).toBeNull();
    expect(redact('plain')).toBe('plain');
    expect(redact(42)).toBe(42);
  });

  /** A cyclic or absurdly deep object must not hang the request. */
  it('stops at a depth limit rather than recursing forever', () => {
    const cyclic: Record<string, unknown> = { name: 'root' };
    cyclic.self = cyclic;
    expect(() => redact(cyclic)).not.toThrow();
  });
});
