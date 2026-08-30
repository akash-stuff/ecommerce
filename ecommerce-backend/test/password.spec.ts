import * as argon2 from 'argon2';
import { generatePassword, hashPassword } from '../src/common/crypto/password';

/**
 * The helpers behind every generated credential on the platform: a staff
 * invite, a staff reset, and now a store owner's reset from the console.
 *
 * They lived as private functions inside `staff.service.ts` and were untested,
 * which for a password hash is the wrong place to have no coverage — two copies
 * of argon2 parameters can drift, and the copy that drifts weaker is the one
 * nobody notices.
 */
describe('generated passwords', () => {
  it('is long enough to be worth generating', () => {
    expect(generatePassword()).toHaveLength(14);
    expect(generatePassword(20)).toHaveLength(20);
  });

  /**
   * Somebody is going to read one of these down a phone line. `O` and `0`,
   * `l` and `1` and `I` are the pairs that get written down wrong.
   */
  it('omits the characters people confuse when reading one out', () => {
    const sample = Array.from({ length: 200 }, () => generatePassword()).join('');
    for (const confusable of ['O', '0', 'l', 'I', '1']) {
      expect(`${confusable} in sample: ${sample.includes(confusable)}`).toBe(
        `${confusable} in sample: false`,
      );
    }
  });

  it('uses letters and digits, not one or the other', () => {
    const sample = Array.from({ length: 100 }, () => generatePassword()).join('');
    expect(sample).toMatch(/[A-Z]/);
    expect(sample).toMatch(/[a-z]/);
    expect(sample).toMatch(/[2-9]/);
  });

  /** A credential drawn from `Math.random` would be predictable from a seed. */
  it('does not repeat itself', () => {
    const many = new Set(Array.from({ length: 500 }, () => generatePassword()));
    expect(many.size).toBe(500);
  });
});

describe('password hashing', () => {
  it('produces an argon2id hash the verifier accepts', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await argon2.verify(hash, 'correct horse battery staple')).toBe(true);
    expect(await argon2.verify(hash, 'wrong password')).toBe(false);
  });

  /**
   * Stated in the code rather than left to the library default, because a
   * default that changes between versions changes the cost of every password in
   * the database without anyone deciding to.
   */
  it('pins the cost parameters', async () => {
    const hash = await hashPassword('x');
    // $argon2id$v=19$m=19456,t=2,p=1$…
    expect(hash).toContain('m=19456');
    expect(hash).toContain('t=2');
    expect(hash).toContain('p=1');
  });

  it('salts, so the same password twice is two different hashes', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(a).not.toBe(b);
    expect(await argon2.verify(a, 'same')).toBe(true);
    expect(await argon2.verify(b, 'same')).toBe(true);
  });
});
