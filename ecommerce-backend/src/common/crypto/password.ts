import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';

/**
 * Hashing and generating account passwords.
 *
 * Shared because these had grown a second home: `staff.service.ts` held the
 * only copy, and the platform console needs the same two functions to reset a
 * store owner's password. Two implementations of a password hash are two sets
 * of argon2 parameters that can drift apart, and the one that drifts weaker is
 * the one nobody notices.
 */

/**
 * argon2id with parameters chosen for an interactive login.
 *
 * 19 MiB and two passes is the OWASP baseline. It is deliberately stated here
 * rather than left to the library default, because a default that changes
 * between versions changes the cost of every password in the database without
 * anyone deciding to.
 */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

/**
 * A password to hand to a person, once.
 *
 * The alphabet omits the characters that are read wrong when a password is
 * dictated over a phone or copied off a screen — no `O`/`0`, no `l`/`I`/`1`.
 * Someone is going to read this one out loud, which is the whole reason it
 * exists.
 *
 * `randomBytes` rather than `Math.random`: this is a credential.
 *
 * The modulo is very slightly biased toward the start of a 55-character
 * alphabet. At this length that costs a fraction of a bit out of roughly 81,
 * and the password is temporary and meant to be changed — worth stating rather
 * than pretending the draw is perfectly uniform.
 */
export function generatePassword(length = 14): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(length);

  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
