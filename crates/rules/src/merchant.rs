//! Every merchant pricing rule, in one file.
//!
//! The hackathon track asks for exactly this: *the merchant pricing rules live
//! in one readable file*. They do, and this is it. The sim, the contract and
//! the interface all come here; none of them has a second copy of the formula.
//!
//! A merchant is an agent with its own purse and its own store. It never names
//! a price: it publishes a **limit** — the most it will pay per crate right
//! now — and the auction clock comes down to it (TW-N-30). Three lines of
//! arithmetic, one sentence of reasoning, nothing else:
//!
//! ```text
//! gap      = target - stock                     (relative to the target)
//! factor   = 1 + gain x gap / target            (gain = 50%, TW-N-31)
//! limit    = base x factor                      (floored, TW-N-31)
//! floor    = base x 25%                         (below it the lot is lost, TW-N-33)
//! ```
//!
//! Consequences the player can feel: flood a merchant and `stock > target`, so
//! the factor falls under 1 and the next lot sells cheaper; starve it and the
//! factor rises. A merchant whose purse cannot cover the lot is skipped, and a
//! closed one does not bid at all (TW-N-51).
//!
//! Units are whatever the caller passes — centigold in the sim, milli-gold in
//! the contract — because every step here is a ratio.

use crate::{format_exact, format_factor_exact_bps};

/// TW-N-31 stock factor in bps: `1 + gain x (target - stock) / target`.
/// Over 10 000 when the store is short, under it when overstocked, clamped at
/// zero when the store is flooded past what the gain can express.
pub fn stock_factor_bps(stock: u64, target: u64, gain_bps: u64) -> u64 {
    if target == 0 {
        return 10_000;
    }
    let gap = target as i64 - stock as i64;
    let factor = 10_000i64 + gain_bps as i64 * gap / target as i64;
    factor.max(0) as u64
}

/// TW-N-31 limit: the most this merchant pays per crate, in the caller's unit.
/// A merchant with no target for that species does not buy it at all.
pub fn limit(base: u64, stock: u64, target: u64, gain_bps: u64) -> u64 {
    if target == 0 {
        return 0;
    }
    let scaled = base as u128 * stock_factor_bps(stock, target, gain_bps) as u128 / 10_000u128;
    scaled.min(u64::MAX as u128) as u64
}

/// TW-N-33 floor: under this price the lot is lost rather than sold.
pub fn floor(base: u64, floor_bps: u64) -> u64 {
    base.saturating_mul(floor_bps) / 10_000
}

/// The tooltip sentence for one merchant, e.g.
/// `Cannery: limit 3.6 = base 4.0 x 0.90 — store 180 against a target of 150.`
pub fn reasoning(name: &str, base: u64, stock: u64, target: u64, gain_bps: u64) -> String {
    let price = limit(base, stock, target, gain_bps);
    let factor = stock_factor_bps(stock, target, gain_bps);
    format!(
        "{name}: limit {} = base {} x {} — store {stock} against a target of {target}.",
        format_exact(price),
        format_exact(base),
        format_factor_exact_bps(factor),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const GAIN: u64 = 5_000;

    #[test]
    fn a_flooded_merchant_pays_less() {
        // Brief section 4.4: 180 crates in store for a target of 150.
        assert_eq!(stock_factor_bps(180, 150, GAIN), 9_000);
        assert_eq!(limit(400, 180, 150, GAIN), 360);
        // Flood it harder: the factor keeps falling.
        assert!(limit(400, 240, 150, GAIN) < limit(400, 180, 150, GAIN));
        // Past twice the target the factor clamps at zero: the merchant stops.
        assert_eq!(stock_factor_bps(450, 150, GAIN), 0);
        assert_eq!(limit(400, 450, 150, GAIN), 0);
    }

    #[test]
    fn a_starved_merchant_pays_more() {
        assert_eq!(stock_factor_bps(75, 150, GAIN), 12_500);
        assert_eq!(limit(400, 75, 150, GAIN), 500);
    }

    #[test]
    fn no_target_means_no_bidding() {
        assert_eq!(limit(400, 0, 0, GAIN), 0);
        assert_eq!(stock_factor_bps(0, 0, GAIN), 10_000);
    }

    #[test]
    fn the_floor_is_a_quarter_of_the_base() {
        assert_eq!(floor(400, 2_500), 100);
        assert_eq!(floor(1_200, 2_500), 300);
    }

    #[test]
    fn the_reasoning_sentence_holds_the_equation() {
        let line = reasoning("Cannery", 400, 180, 150, GAIN);
        assert_eq!(
            line,
            "Cannery: limit 3.6 = base 4.0 x 0.90 — store 180 against a target of 150."
        );
    }
}
