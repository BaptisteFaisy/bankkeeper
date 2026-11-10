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

/// Catch that leaves the stock where it is: the day's logistic regrowth,
/// `rate x stock x (1 - stock / capacity)` (TW-N-03), in crates.
///
/// This is a reading, not a write: it names the ceiling a zone can give back
/// every day without being drawn down. It follows [`regrow`] crate for crate,
/// one-crate floor included, so the figure the register shows is the growth
/// the sea actually performs tonight. One deliberate exception: a rate of
/// zero gives 0 here, where [`regrow`] would still hand out its floor crate.
///
/// Shape of the curve, worth knowing before reading the register:
/// - `stock == capacity` gives 0: a full sea grows nothing, so every crate
///   taken from it is taken from capital, not from interest;
/// - it peaks at `capacity / 4` (times the rate, back to a day) when
///   `stock == capacity / 2`, the fastest point of a logistic curve;
/// - `stock == 0` gives 0: an empty zone never comes back (TW-N-04).
pub fn sustainable_catch(stock: u64, capacity: u64, regrow_bps: u64) -> u64 {
    if capacity == 0 || stock == 0 || stock >= capacity || regrow_bps == 0 {
        return 0;
    }
    let grown = stock as u128
        * (capacity - stock) as u128
        * regrow_bps as u128
        / capacity as u128
        / 10_000u128;
    (grown.max(1).min(u64::MAX as u128)) as u64
}

#[cfg(test)]
mod tests {
    use crate::state::Zone;

    use super::*;

    #[test]
    fn sustainable_catch_is_dead_at_both_ends() {
        // A full sea grows nothing: its yield is zero by construction.
        assert_eq!(sustainable_catch(5000, 5000, 500), 0);
        assert_eq!(sustainable_catch(6000, 5000, 500), 0);
        // An emptied zone never regrows (TW-N-04).
        assert_eq!(sustainable_catch(0, 5000, 500), 0);
        assert_eq!(sustainable_catch(2500, 0, 500), 0);
        assert_eq!(sustainable_catch(2500, 5000, 0), 0);
    }

    #[test]
    fn sustainable_catch_peaks_at_half_the_capacity() {
        // capacity / 4 x rate back to a day: 1250 x 5% = 62.5 crates.
        let peak = sustainable_catch(2500, 5000, 500);
        assert_eq!(peak, 62);
        for stock in (100..5000).step_by(50) {
            assert!(sustainable_catch(stock, 5000, 500) <= peak, "stock {stock}");
        }
    }

    #[test]
    fn sustainable_catch_reads_the_same_growth_regrow_writes() {
        // The register must never promise a number the sea does not perform.
        for stock in [0, 1, 2, 97, 900, 2500, 4200, 4999, 5000, 6000] {
            for rate in [200, 500, 900] {
                assert_eq!(
                    sustainable_catch(stock, 5000, rate),
                    regrow(stock, 5000, rate),
                    "stock {stock} rate {rate}"
                );
            }
        }
    }

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
