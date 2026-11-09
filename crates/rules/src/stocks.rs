//! TW-N-01..05: the shared fish stocks.
//!
//! Every captain draws from the same three stocks. A trip takes 0.4% of the
//! zone stock (TW-N-02); overnight each stock regrows logistically (TW-N-03)
//! and a stock at zero never regrows (TW-N-04). Two integer readings keep the
//! model exact without floats: a trip lands at least one crate while any fish
//! remain (so small stocks can still empty), and any live stock below
//! capacity regrows at least one crate overnight.

use crate::config::Config;

/// Crates landed by one trip on a stock of `stock` crates (TW-N-02).
///
/// The 0.4% share rounds half up: flooring pins five boats at the regrowth
/// rate forever, so Greybank could never empty (lot 0).
pub fn trip_catch(stock: u64, config: &Config) -> u64 {
    if stock == 0 {
        return 0;
    }
    let share = (stock as u128 * config.catch_share_bps as u128 + 5_000u128) / 10_000u128;
    (share.max(1).min(u64::MAX as u128)) as u64
}

/// Overnight regrowth: rate x stock x (1 - stock / capacity) (TW-N-03).
/// Zero never regrows (TW-N-04); stocks at or above capacity do not grow.
pub fn regrow(stock: u64, capacity: u64, rate_bps: u64) -> u64 {
    if capacity == 0 || stock == 0 || stock >= capacity {
        return 0;
    }
    let grown = stock as u128
        * (capacity - stock) as u128
        * rate_bps as u128
        / capacity as u128
        / 10_000u128;
    (grown.max(1).min(u64::MAX as u128)) as u64
}

#[cfg(test)]
mod tests {
    use crate::state::Zone;

    use super::*;

    fn config() -> Config {
        Config::default()
    }

    #[test]
    fn greybank_equilibrium_matches_the_brief() {
        // Section 4.1: near 2,600 crates, a trip lands ~10 and the bank
        // rebuilds ~62 overnight, the two-boat sustainable yield.
        let cfg = config();
        assert_eq!(trip_catch(2620, &cfg), 10);
        assert_eq!(regrow(2620, cfg.zone_capacity[Zone::Greybank.idx()], 500), 62);
    }

    #[test]
    fn zero_never_regrows_and_full_never_grows() {
        assert_eq!(regrow(0, 5000, 500), 0);
        assert_eq!(regrow(5000, 5000, 500), 0);
        assert_eq!(regrow(6000, 5000, 500), 0);
        assert_eq!(trip_catch(0, &config()), 0);
    }

    #[test]
    fn small_stocks_stay_alive_but_fishable() {
        let cfg = config();
        assert_eq!(trip_catch(100, &cfg), 1);
        assert_eq!(regrow(1, 5000, 500), 1);
    }
}
