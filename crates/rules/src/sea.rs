//! Barreau 4 — Hériter : the debt owed to the sea, and the two ways to pay it.
//!
//! The register of barreau 1 already names, zone by zone, what the port took
//! and what the zone could give back by itself ([`crate::stocks::sustainable_catch`]).
//! This module turns the gap between the two into a **debt**, in crates, the
//! only unit the player reads without a calculator. It is never paid in gold:
//!
//! - **fallow** — a zone left closed for a while; the sea keeps what it would
//!   have grown ([`fallow_credit`]), the port loses the revenue;
//! - **reseeding** — the port fund buys juveniles abroad and puts them back
//!   ([`reseed_cost`]); the gold leaves the port, the crates return.
//!
//! Nothing here judges: these are readings and prices, never a sermon.

use crate::stocks::regrow;

/// Debt a season leaves the sea, in crates: what the port took above what the
/// zone could give back by itself over the same days.
///
/// `sustainable_per_day` is the zone's own figure ([`crate::stocks::sustainable_catch`]),
/// so a season that stays under its ceiling adds nothing at all.
pub fn season_debt(taken: u64, sustainable_per_day: u64, days: u64) -> u64 {
    taken.saturating_sub(sustainable_per_day.saturating_mul(days))
}

/// Crates a stretch of fallow gives back: the regrowth a closed zone performs
/// over `days`, at the stock it holds today.
///
/// It follows [`regrow`] crate for crate, so it never promises more than the
/// sea actually grows. Deliberately conservative: the stock rises while the
/// zone rests, so the real regrowth of day seven is larger than day one's —
/// the credit counts every day at today's rate.
pub fn fallow_credit(stock: u64, capacity: u64, regrow_bps: u64, days: u64) -> u64 {
    regrow(stock, capacity, regrow_bps).saturating_mul(days)
}

/// Gold a reseed of `crates` costs at `price_per_crate` (both centigold).
pub fn reseed_cost(crates: u64, price_per_crate: u64) -> u64 {
    crates.saturating_mul(price_per_crate)
}

/// Crates a purse of `gold` reseeds at `price_per_crate` (both centigold).
/// Zero price buys nothing: a free sea is not a purchase, it is a gift.
pub fn reseeded_crates(gold: u64, price_per_crate: u64) -> u64 {
    if price_per_crate == 0 {
        return 0;
    }
    gold / price_per_crate
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A season under the ceiling owes nothing: the surplus is floored at 0.
    #[test]
    fn a_light_season_owes_nothing() {
        assert_eq!(season_debt(1_000, 62, 28), 0);
        assert_eq!(season_debt(1_736, 62, 28), 0);
        assert_eq!(season_debt(0, 62, 28), 0);
    }

    /// A season over the ceiling owes exactly the surplus, crate for crate.
    #[test]
    fn a_heavy_season_owes_the_surplus() {
        // 62 a day x 28 days = 1,736; 2,800 taken leaves 1,064 of debt.
        assert_eq!(season_debt(2_800, 62, 28), 1_064);
        assert_eq!(season_debt(2_801, 62, 28), 1_065);
    }

    /// A zone that can give nothing back (full or empty sea) owes every crate
    /// taken from it — the reading the register already prints as "capital".
    #[test]
    fn a_sea_that_grows_nothing_owes_every_crate() {
        assert_eq!(season_debt(500, 0, 28), 500);
    }

    /// Fallow credit is the regrowth of the zone, day after day.
    #[test]
    fn fallow_credit_follows_the_regrowth() {
        // Greybank, 2,500 of 5,000, 5% a day: 62 crates a day, 434 a week.
        assert_eq!(fallow_credit(2_500, 5_000, 500, 7), 434);
        assert_eq!(fallow_credit(2_500, 5_000, 500, 28), 1_736);
        // A dead zone grows nothing, so resting it credits nothing.
        assert_eq!(fallow_credit(0, 5_000, 500, 7), 0);
        assert_eq!(fallow_credit(5_000, 5_000, 500, 7), 0);
    }

    /// Reseeding is a price: crates x price, and the purse buys what it can.
    #[test]
    fn reseeding_is_a_price_and_nothing_else() {
        assert_eq!(reseed_cost(100, 350), 35_000);
        assert_eq!(reseeded_crates(35_000, 350), 100);
        assert_eq!(reseeded_crates(349, 350), 0);
        assert_eq!(reseeded_crates(1_000, 0), 0);
    }
}
