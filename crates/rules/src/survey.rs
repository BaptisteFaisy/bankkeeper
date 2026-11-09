//! TW-C1: paid stock surveys; the real stock stays hidden.
//!
//! The player never sees the true stock (TW-C1-01), only catch per trip and
//! its weekly trend (TW-C1-02). A survey costs 80 gold, covers one zone,
//! estimates within 10% and stays valid a week (TW-C1-03). The estimate is a
//! deterministic function of (seed, day, zone): sim and contract agree.

use serde::{Deserialize, Serialize};

use crate::config::Config;
use crate::format_crates;
use crate::state::Zone;

/// A bought survey: zone, day of purchase, frozen estimate in crates.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Survey {
    pub zone: Zone,
    pub day: u64,
    pub estimate: u64,
}

/// SplitMix64 avalanche: deterministic jitter without an RNG dependency.
fn splitmix64(mut x: u64) -> u64 {
    x = x.wrapping_add(0x9E3779B97F4A7C15);
    let mut z = x;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}

/// Survey estimate for a zone: within +-10% of the real stock (TW-C1-03).
pub fn buy_estimate(stock: u64, seed: u64, day: u64, zone: Zone, config: &Config) -> u64 {
    if stock == 0 {
        return 0;
    }
    let key = seed
        .wrapping_add(day.wrapping_mul(0x9E3779B97F4A7C15))
        .wrapping_add((zone.idx() as u64).wrapping_mul(0xBF58476D1CE4E5B9));
    let window = config.survey_tolerance_bps * 2 + 1;
    let jitter = splitmix64(key) % window;
    let factor = 10_000 - config.survey_tolerance_bps + jitter;
    (stock as u128 * factor as u128 / 10_000u128).min(u64::MAX as u128) as u64
}

/// True while the survey is still fresh (TW-C1-03: valid one week).
pub fn is_valid(survey_day: u64, today: u64, config: &Config) -> bool {
    today.saturating_sub(survey_day) < config.survey_valid_days
}

/// Average crates per trip over a day (TW-C1-02 display input).
pub fn catch_per_trip(crates: u64, trips: u64) -> u64 {
    if trips == 0 {
        0
    } else {
        crates / trips
    }
}

/// Weekly trend of catch per trip, written out (`falling`, never blinking).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Trend {
    Rising,
    Steady,
    Falling,
}

/// Trend of `recent` against `older`: beyond +-5% it moves, else steady.
pub fn trend(recent: u64, older: u64) -> Trend {
    if older == 0 {
        return if recent == 0 { Trend::Steady } else { Trend::Rising };
    }
    let ratio = recent.saturating_mul(100) / older;
    if ratio >= 105 {
        Trend::Rising
    } else if ratio <= 95 {
        Trend::Falling
    } else {
        Trend::Steady
    }
}

/// Brief section 7 reasoning line: "Greybank survey: about 3,000 crates,
/// give or take 10%."
pub fn survey_reasoning(zone: &str, estimate: u64) -> String {
    format!(
        "{zone} survey: about {} crates, give or take 10%.",
        format_crates(estimate)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> Config {
        Config::default()
    }

    #[test]
    fn estimate_stays_within_10_percent() {
        let cfg = config();
        for seed in 0..50 {
            for day in [0, 6, 27] {
                let estimate = buy_estimate(3000, seed, day, Zone::Greybank, &cfg);
                assert!((2700..=3300).contains(&estimate), "{estimate}");
            }
        }
        assert_eq!(buy_estimate(0, 1, 1, Zone::Deeps, &cfg), 0);
    }

    #[test]
    fn estimate_is_deterministic() {
        let cfg = config();
        let first = buy_estimate(3000, 9, 14, Zone::Greybank, &cfg);
        assert_eq!(first, buy_estimate(3000, 9, 14, Zone::Greybank, &cfg));
    }

    #[test]
    fn survey_lasts_exactly_one_week() {
        let cfg = config();
        assert!(is_valid(10, 16, &cfg));
        assert!(!is_valid(10, 17, &cfg));
    }

    #[test]
    fn catch_signals_and_trends() {
        assert_eq!(catch_per_trip(62, 6), 10);
        assert_eq!(catch_per_trip(0, 0), 0);
        assert_eq!(trend(12, 16), Trend::Falling);
        assert_eq!(trend(16, 16), Trend::Steady);
        assert_eq!(trend(18, 16), Trend::Rising);
        assert_eq!(
            survey_reasoning("Greybank", 3000),
            "Greybank survey: about 3,000 crates, give or take 10%."
        );
    }
}
