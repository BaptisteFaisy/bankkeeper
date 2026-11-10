//! Optional landing signatures. The service keeps no key of its own: the host
//! sets `MARKET_SECRET` and the client signs `player|species|crates|floor|window`
//! with the same secret. Without a secret nothing is checked, and the receipt
//! says so (`signature: "none"`) instead of pretending otherwise.

import { createHmac, timingSafeEqual } from 'node:crypto';

/** The canonical string a landing signature covers. */
export function landingPayload({ player, species, crates, price_floor: floor = 0, window }) {
  return [player, species, crates, floor, window].join('|');
}

export function signLanding(secret, fields) {
  return createHmac('sha256', secret).update(landingPayload(fields)).digest('hex');
}

export function verifyLanding(secret, fields, signature) {
  const expected = Buffer.from(signLanding(secret, fields), 'utf8');
  const given = Buffer.from(String(signature ?? ''), 'utf8');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
