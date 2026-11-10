//! TW-N-30..33: the Dutch auction at the quay.
//!
//! Each lot sells to the first buyer whose limit the falling clock reaches
//! (TW-N-30). A limit is base price x stock factor (TW-N-31); buying raises
//! the buyer stock, so the next lot sells cheaper (TW-N-32). A lot nobody
//! takes above the floor price is lost (TW-N-33). Ties break in canonical
//! roster order, so callers pass buyers in [`ActorId`](crate::state::ActorId)
//! order. A buyer who cannot cover the lot at its limit is skipped.

use serde::{Deserialize, Serialize};

use crate::config::Config;
use crate::state::{ActorId, Species};
use crate::{format_exact, format_factor_exact_bps};

/// One bidder for a lot: limit inputs plus solvency inputs.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Buyer {
    pub actor: ActorId,
    /// Crates of the lot species already in store.
    pub stock: u64,
    /// Target stock of that species (TW-N-31).
    pub target: u64,
    /// Purse in centigold: the buyer must cover the lot.
    pub gold: i64,
    /// False when the buyer does not take this species (Gull vs herring).
    pub buys: bool,
    /// False once closed (TW-N-51).
    pub open: bool,
}

/// One landed lot, sold at once (TW-N-12).
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Lot {
    pub species: Species,
    pub crates: u64,
}

/// Auction result: sold at the winner limit, or lost below the floor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Outcome {
    Sold {
        buyer: ActorId,
        price: u64,
        total: u64,
    },
    Unsold {
        best_limit: u64,
    },
}

/// TW-N-31 stock factor in bps: 1 + 0.5 x relative gap to target. Over 1 when
/// short, under 1 when overstocked, clamped at 0 when flooded.
pub fn stock_factor_bps(stock: u64, target: u64, config: &Config) -> u64 {
    if target == 0 {
        return 10_000;
    }
    let gap = target as i64 - stock as i64;
    let factor = 10_000i64 + config.stock_gain_bps as i64 * gap / target as i64;
    factor.max(0) as u64
}

/// TW-N-31 buyer limit in centigold: base x stock factor.
pub fn bid_limit(base: u64, stock: u64, target: u64, config: &Config) -> u64 {
    let limit = base as u128 * stock_factor_bps(stock, target, config) as u128 / 10_000u128;
    limit.min(u64::MAX as u128) as u64
}

/// Floor price in centigold: base x 25% (TW-N-33).
pub fn floor_price(base: u64, config: &Config) -> u64 {
    base.saturating_mul(config.floor_bps) / 10_000
}

/// Run the Dutch clock over `buyers` for `lot`. Pure and deterministic.
pub fn clear(lot: &Lot, buyers: &[Buyer], config: &Config) -> Outcome {
    if lot.crates == 0 {
        return Outcome::Unsold { best_limit: 0 };
    }
    let base = config.base_price(lot.species);
    let floor = floor_price(base, config);
    let mut ranked: Vec<(usize, u64)> = buyers
        .iter()
        .enumerate()
        .map(|(i, b)| (i, bid_limit(base, b.stock, b.target, config)))
        .collect();
    ranked.sort_by(|a, b| b.1.cmp(&a.1));
    let best = ranked.first().map(|rank| rank.1).unwrap_or(0);
    for (index, limit) in ranked {
        let buyer = &buyers[index];
        if !buyer.buys || !buyer.open || limit < floor {
            continue;
        }
        let total = limit.saturating_mul(lot.crates);
        if i64::try_from(total).is_ok_and(|due| buyer.gold >= due) {
            return Outcome::Sold {
                buyer: buyer.actor,
                price: limit,
                total,
            };
        }
    }
    Outcome::Unsold { best_limit: best }
}

/// Brief section 7 reasoning line, e.g. "Sold to Cannery: 14 x 3.6 = 50.4.
/// Limit 3.6 = base 4.0 x 0.90." No stock figure: TW-C1-01 forbids showing
/// the real stock to the player (M1). The shown factor is the EFFECTIVE one
/// (limit / base): bid_limit floors to the cent, so the input stock factor
/// would print an equation that does not hold (defect 3 follow-up).
pub fn sale_reasoning(
    buyer: &str,
    crates: u64,
    price: u64,
    base: u64,
    factor_bps: u64,
    _stock: u64,
    _target: u64,
) -> String {
    format!(
        "Sold to {buyer}: {crates} x {} = {}. Limit {} = base {} x {}.",
        format_exact(price),
        format_exact(price.saturating_mul(crates)),
        format_exact(price),
        format_exact(base),
        format_factor_exact_bps(shown_factor_bps(price, base, factor_bps)),
    )
}

/// Effective factor in bps, round-half-up: the multiplier that rebuilds the
/// shown limit from the shown base. Falls back to the input stock factor
/// when the base is zero (never happens: bases are 400/1200).
fn shown_factor_bps(price: u64, base: u64, factor_bps: u64) -> u64 {
    if base == 0 {
        return factor_bps;
    }
    let scaled = price as u128 * 10_000u128;
    ((scaled + base as u128 / 2) / base as u128).min(u64::MAX as u128) as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::format_price;

    fn config() -> Config {
        Config::default()
    }

    fn cannery(stock: u64, gold: i64) -> Buyer {
        Buyer {
            actor: ActorId::Cannery,
            stock,
            target: 150,
            gold,
            buys: true,
            open: true,
        }
    }

    #[test]
    fn brief_example_sells_at_36_then_34() {
        // Section 4.4: 14 crates of herring, Cannery at 180 of 150.
        let cfg = config();
        let lot = Lot {
            species: Species::Herring,
            crates: 14,
        };
        let buyers = vec![
            cannery(180, 300_000),
            Buyer {
                actor: ActorId::Fishmonger,
                stock: 90,
                target: 60,
                gold: 60_000,
                buys: true,
                open: true,
            },
            Buyer {
                actor: ActorId::Gull,
                stock: 0,
                target: 0,
                gold: 40_000,
                buys: false,
                open: true,
            },
        ];
        let outcome = clear(&lot, &buyers, &cfg);
        assert_eq!(
            outcome,
            Outcome::Sold {
                buyer: ActorId::Cannery,
                price: 360,
                total: 5040,
            }
        );
        // TW-N-32: after the purchase the stock is 194 and the limit falls.
        assert_eq!(bid_limit(400, 194, 150, &cfg), 341);
        assert_eq!(format_price(341), "3.4");
        assert_eq!(
            sale_reasoning("Cannery", 14, 360, 400, 9000, 180, 150),
            "Sold to Cannery: 14 x 3.6 = 50.4. Limit 3.6 = base 4.0 x 0.90."
        );
    }

    #[test]
    fn inexact_limit_shows_hammer_and_holds_the_equation() {
        // 573 = 400 x 1.4325 exactly: the shown limit must equal the hammer
        // price and the factor equation must hold (defect 3).
        assert_eq!(
            sale_reasoning("Cannery", 20, 573, 400, 14325, 20, 150),
            "Sold to Cannery: 20 x 5.73 = 114.6. Limit 5.73 = base 4.0 x 1.4325."
        );
    }

    #[test]
    fn floored_limit_shows_the_effective_factor() {
        // bid_limit floors 400 x 1.1433 = 457.32 to 457: the line must show
        // the effective factor 457/400 = 1.1425, so the equation holds.
        assert_eq!(
            sale_reasoning("Cannery", 4, 457, 400, 11433, 20, 150),
            "Sold to Cannery: 4 x 4.57 = 18.28. Limit 4.57 = base 4.0 x 1.1425."
        );
    }

    #[test]
    fn lot_below_floor_is_lost() {
        let cfg = config();
        let lot = Lot {
            species: Species::Herring,
            crates: 10,
        };
        let buyers = vec![cannery(10_000, 300_000)];
        let outcome = clear(&lot, &buyers, &cfg);
        assert!(matches!(outcome, Outcome::Unsold { .. }));
    }

    #[test]
    fn broke_winner_is_skipped_for_the_next_bidder() {
        let cfg = config();
        let lot = Lot {
            species: Species::Herring,
            crates: 14,
        };
        let buyers = vec![cannery(0, 100), cannery(180, 300_000)];
        let outcome = clear(&lot, &buyers, &cfg);
        assert_eq!(
            outcome,
            Outcome::Sold {
                buyer: ActorId::Cannery,
                price: 360,
                total: 5040,
            }
        );
    }

    #[test]
    fn ties_break_in_roster_order() {
        let cfg = config();
        let lot = Lot {
            species: Species::Herring,
            crates: 1,
        };
        let first = Buyer {
            actor: ActorId::Fishmonger,
            stock: 60,
            target: 60,
            gold: 60_000,
            buys: true,
            open: true,
        };
        let outcome = clear(&lot, &[first, cannery(150, 300_000)], &cfg);
        assert_eq!(
            outcome,
            Outcome::Sold {
                buyer: ActorId::Fishmonger,
                price: 400,
                total: 400,
            }
        );
    }
}
