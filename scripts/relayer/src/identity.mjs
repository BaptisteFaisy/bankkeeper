// Identity of a captain: the email, and the account it always maps to.
//
// One rule, one place: the same email must always give the same account id,
// on every server, forever. The account id is derived from the email (not
// stored), so a lost database does not lose the players; the *key* is the
// only thing that is stored, and it never leaves the server.
import crypto from 'node:crypto';

/** Twenty hex characters of SHA-256: short enough for an account id, long
 *  enough that two players do not collide. */
export function emailHash(email) {
  return crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex').slice(0, 20);
}

/** The email, trimmed and lowercased, or an error. */
export function normaliseEmail(email) {
  const value = String(email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) throw new Error('invalid email');
  return value;
}

/** The key of a captain in every ledger: the email, hashed. */
export function accountKey(email) {
  return emailHash(email);
}
