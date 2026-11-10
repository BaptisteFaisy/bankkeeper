//! The one price formula of the shared auction (TW-N-31, reused).
//!
//! The port's merchants already price a lot with the stock factor of
//! `crates/rules/src/merchant.rs`:
//!
//! ```text
//! factor = 1 + gain x (target - stock) / target
//! limit  = base x factor
//! ```
//!
//! The shared market keeps that family and swaps the merchant's store for the
//! tonnage every player landed in the window: `target` becomes the depth of
//! the auction (`MARKET_DEPTH_CRATES`), `stock` becomes that tonnage, and
//! `gain` becomes the market elasticity (`MARKET_ELASTICITY_BPS`). Above the
//! depth the factor falls under one and everybody is paid less; under it, the
//! scarcity premium applies. Same arithmetic, same units (centigold), same
//! integer truncation towards zero as the Rust side: equal inputs, equal price.

/** Base prices in centigold, section 12 of the brief: herring 4, cod 12. */
export const BASE_CENTIGOLD = Object.freeze({ herring: 400, cod: 1200 });

export const SPECIES = Object.freeze(Object.keys(BASE_CENTIGOLD));

/**
 * TW-N-31 stock factor, kept verbatim: `1 + gain x (target - stock) / target`
 * in bps, clamped at zero like the Rust `stock_factor_bps`.
 */
export function stockFactorBps(tonnage, depth, elasticityBps) {
  if (depth === 0) return 10_000;
  const gap = depth - tonnage;
  return Math.max(0, 10_000 + Math.trunc((elasticityBps * gap) / depth));
}

/** Clamp a price between the window floor and the Dutch clock ceiling. */
export function clampPrice(cents, floorCents, ceilingCents) {
  return Math.min(Math.max(cents, floorCents), ceilingCents);
}

/**
 * The window price, in centigold: `price = anchor x factor(tonnage)`.
 *
 * `anchor` is the market memory (the last closed price), so a quiet window
 * reopens where the last one shut. The result is bounded by the port's own
 * rules: never under the floor (TW-N-33, base x 25%), never above the Dutch
 * clock start (base x 2).
 */
export function windowPrice({ anchor, tonnage, depth, elasticityBps, floorCents, ceilingCents }) {
  const factor = stockFactorBps(tonnage, depth, elasticityBps);
  return clampPrice(Math.trunc((anchor * factor) / 10_000), floorCents, ceilingCents);
}

/** `360` -> `"3.6"`, the same rendering as `rules::format_exact`. */
export function formatGold(cents) {
  const text = `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
  return text.endsWith('0') ? text.slice(0, -1) : text;
}

/** `9000` -> `"0.90"`, as `rules::format_factor_bps`. */
export function formatFactorBps(bps) {
  return `${Math.trunc(bps / 10_000)}.${String(Math.trunc((bps % 10_000) / 100)).padStart(2, '0')}`;
}
