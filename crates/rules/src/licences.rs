//! TW-N-20..23: tradeable catch licences.
//!
//! Twenty licence tokens cap the port at 1,400 crates a week (TW-N-20).
//! Captains trade them: an NPC sells one when short of gold and buys one
//! when the quota grounds boats that could fish (TW-N-22). A licence held
//! but unfished removes 70 crates a week of pressure on the sea (TW-N-23).

use serde::{Deserialize, Serialize};

use crate::config::Config;

/// Why a licence trade was refused. Nothing moves on failure.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum LicenceError {
    ZeroQuantity,
    SellerShortOfLicences { have: u64, need: u64 },
    BuyerShortOfGold { have: i64, need: u64 },
    /// The buyer already holds the per-captain ceiling: licences stay spread
    /// over the port, so the council vote cannot be bought out (section 13).
    CapReached { have: u64, cap: u64 },
    Overflow,
}

/// Result of a settled licence trade.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LicenceTrade {
    pub licences_moved: u64,
    pub gold_moved: u64,
}

/// Weekly landing quota for `licences` held (TW-N-20: 70 each).
pub fn weekly_quota(licences: u64, config: &Config) -> u64 {
    licences.saturating_mul(config.quota_per_licence)
}

/// Whole-port weekly quota: 20 x 70 = 1,400 crates.
pub fn port_quota(config: &Config) -> u64 {
    weekly_quota(config.licence_count, config)
}

/// Weekly crates removed from sea pressure by unfished licences (TW-N-23).
pub fn pressure_removed(idle_licences: u64, config: &Config) -> u64 {
    weekly_quota(idle_licences, config)
}

/// True when adding `adding` licences would break the per-captain ceiling.
/// A ceiling of zero means "no ceiling".
pub fn cap_reached(held: u64, cap: u64, adding: u64) -> bool {
    cap > 0 && held.saturating_add(adding) > cap
}

/// TW-N-22 sell trigger: below the gold reserve, down to the last licence
/// (a captain with zero licences could never fish again).
pub fn should_sell_licence(gold: i64, reserve_target: i64, held: u64) -> bool {
    held > 1 && gold < reserve_target
}

/// TW-N-22 buy trigger: quota exhausted while boats could still fish, and the
/// asking price is covered.
pub fn should_buy_licence(quota_left: u64, boats_ready: u64, gold: i64, price: u64) -> bool {
    quota_left == 0 && boats_ready > 0 && i64::try_from(price).is_ok_and(|p| gold >= p)
}

/// Move `count` licences from seller to buyer at `price_each` (centigold).
/// Balances pass in and out; storage stays with the caller.
pub fn trade_licences(
    seller_licences: u64,
    buyer_licences: u64,
    seller_gold: i64,
    buyer_gold: i64,
    count: u64,
    price_each: u64,
) -> Result<(LicenceTrade, (u64, u64, i64, i64)), LicenceError> {
    if count == 0 {
        return Err(LicenceError::ZeroQuantity);
    }
    if seller_licences < count {
        return Err(LicenceError::SellerShortOfLicences {
            have: seller_licences,
            need: count,
        });
    }
    let gold_moved = count.checked_mul(price_each).ok_or(LicenceError::Overflow)?;
    let price = i64::try_from(gold_moved).map_err(|_| LicenceError::Overflow)?;
    if buyer_gold < price {
        return Err(LicenceError::BuyerShortOfGold {
            have: buyer_gold,
            need: gold_moved,
        });
    }
    seller_gold.checked_add(price).ok_or(LicenceError::Overflow)?;
    Ok((
        LicenceTrade {
            licences_moved: count,
            gold_moved,
        },
        (
            seller_licences - count,
            buyer_licences + count,
            seller_gold + price,
            buyer_gold - price,
        ),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> Config {
        Config::default()
    }

    #[test]
    fn port_quota_is_1400_crates() {
        let cfg = config();
        assert_eq!(port_quota(&cfg), 1400);
        assert_eq!(pressure_removed(2, &cfg), 140);
    }

    #[test]
    fn npc_trade_triggers() {
        assert!(should_sell_licence(50, 500, 4));
        assert!(!should_sell_licence(50, 500, 1));
        assert!(!should_sell_licence(600, 500, 4));
        assert!(should_buy_licence(0, 2, 30_000, 20_000));
        assert!(!should_buy_licence(0, 2, 10_000, 20_000));
        assert!(!should_buy_licence(10, 2, 30_000, 20_000));
    }

    #[test]
    fn trade_moves_licences_for_gold() {
        let (trade, balances) = trade_licences(8, 4, 20_000, 50_000, 2, 20_000).unwrap();
        assert_eq!((trade.licences_moved, trade.gold_moved), (2, 40_000));
        assert_eq!(balances, (6, 6, 60_000, 10_000));
    }

    #[test]
    fn broke_buyer_cannot_buy() {
        let err = trade_licences(8, 4, 20_000, 10_000, 1, 20_000).unwrap_err();
        assert_eq!(
            err,
            LicenceError::BuyerShortOfGold {
                have: 10_000,
                need: 20_000
            }
        );
    }
}
