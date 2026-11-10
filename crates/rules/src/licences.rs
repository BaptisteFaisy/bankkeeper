//! TW-N-20..23: tradeable catch licences.
//!
//! Twenty licence tokens cap the port at 1,400 crates a week (TW-N-20).
//! Captains trade them: an NPC sells one when short of gold and buys one
//! when the quota grounds boats that could fish (TW-N-22). A licence held
//! but unfished removes 70 crates a week of pressure on the sea (TW-N-23).
//!
//! TW-N-24 (lease market): a licence is also a rentable asset. A [`Lease`]
//! lends one licence for a fixed number of weeks: the lessee fishes the
//! quota, the lessor collects the rent, and ownership never moves. The
//! weekly rent defaults to 5% of the going licence price.

use serde::{Deserialize, Serialize};

use crate::config::Config;
use crate::state::ActorId;

/// Why a licence trade was refused. Nothing moves on failure.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum LicenceError {
    ZeroQuantity,
    SellerShortOfLicences { have: u64, need: u64 },
    BuyerShortOfGold { have: i64, need: u64 },
    /// The buyer already holds the per-captain ceiling: licences stay spread
    /// over the port, so the council vote cannot be bought out (section 13).
    CapReached { have: u64, cap: u64 },
    /// Every licence of the seller is out on lease: a leased licence is not
    /// for sale, the lessor must take it back first.
    LicenceOnLease { free: u64 },
    /// Lease desk refusals: no licence to lend, same captain twice, or a
    /// term outside [`MAX_LEASE_WEEKS`].
    NoFreeLicence,
    SelfLease,
    BadLeaseWeeks { weeks: u64 },
    NoSuchLease,
    Overflow,
}

/// Result of a settled licence trade.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LicenceTrade {
    pub licences_moved: u64,
    pub gold_moved: u64,
}

/// One licence lent for a fixed number of weeks. A lease covers exactly one
/// licence: the quota follows the lessee for the whole term, the licence
/// itself stays the lessor's property, and the rent is paid every Monday.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Lease {
    /// Owner of the licence: it fishes nothing while the lease runs.
    pub lessor: ActorId,
    /// Captain who fishes the quota and pays the rent.
    pub lessee: ActorId,
    /// Rent per Monday, in centigold.
    pub weekly_rent: u64,
    /// Week the lease was signed (0-based, like the harbour clock).
    pub starts_week: u64,
    /// Mondays still to pay: the lease ends when this reaches zero.
    pub weeks_left: u64,
}

/// Share of the going licence price charged as weekly rent, in bps (5%).
pub const DEFAULT_RENT_BPS: u64 = 500;
/// Rent floor, in centigold: one gold piece a week, never less.
pub const MIN_WEEKLY_RENT: u64 = 100;
/// Longest lease a captain may sign, in weeks (a whole season).
pub const MAX_LEASE_WEEKS: u64 = 12;

/// Default weekly rent: 5% of the going licence price, rounded to the cent,
/// with a floor of one gold piece (a 200 gold licence rents at 10 gold).
pub fn default_weekly_rent(licence_price: u64) -> u64 {
    let cents = licence_price.saturating_mul(DEFAULT_RENT_BPS).saturating_add(5_000);
    (cents / 10_000).max(MIN_WEEKLY_RENT)
}

/// Held minus lent out plus rented in: the licences a captain actually
/// fishes with this week.
pub fn effective_licences(held: u64, lent_out: u64, rented_in: u64) -> u64 {
    held.saturating_sub(lent_out).saturating_add(rented_in)
}

/// Licences a captain may still sell: a licence on lease is not for sale.
pub fn sellable_licences(held: u64, lent_out: u64) -> u64 {
    held.saturating_sub(lent_out)
}

/// Licences `actor` has lent out.
pub fn leased_out(leases: &[Lease], actor: ActorId) -> u64 {
    leases.iter().filter(|lease| lease.lessor == actor).count() as u64
}

/// Licences `actor` has rented in.
pub fn leased_in(leases: &[Lease], actor: ActorId) -> u64 {
    leases.iter().filter(|lease| lease.lessee == actor).count() as u64
}

/// Licences `actor` owns: what it fishes, plus what it lends out, minus what
/// it rents in. Property, as the council vote and the 8-licence ceiling read
/// it; the lease never moves it.
pub fn owned_licences(fished: u64, leases: &[Lease], actor: ActorId) -> u64 {
    fished
        .saturating_add(leased_out(leases, actor))
        .saturating_sub(leased_in(leases, actor))
}

/// True when a purse covers this week's rent.
pub fn rent_covered(gold: i64, weekly_rent: u64) -> bool {
    i64::try_from(weekly_rent).is_ok_and(|rent| gold >= rent)
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

    #[test]
    fn default_rent_is_five_percent_with_a_one_gold_floor() {
        assert_eq!(default_weekly_rent(20_000), 1_000, "200 gold rents at 10");
        assert_eq!(default_weekly_rent(6_000), 300);
        assert_eq!(default_weekly_rent(20), MIN_WEEKLY_RENT, "floor: 1 gold");
        assert_eq!(default_weekly_rent(0), MIN_WEEKLY_RENT);
        assert_eq!(default_weekly_rent(20_001), 1_000, "rounded to the cent");
    }

    #[test]
    fn a_lease_moves_quota_and_keeps_property() {
        let lease = Lease {
            lessor: ActorId::Hale,
            lessee: ActorId::You,
            weekly_rent: 1_000,
            starts_week: 0,
            weeks_left: 2,
        };
        let leases = [lease];
        assert_eq!(effective_licences(4, 1, 1), 4);
        assert_eq!(sellable_licences(4, 1), 3);
        assert_eq!(leased_out(&leases, ActorId::Hale), 1);
        assert_eq!(leased_in(&leases, ActorId::You), 1);
        assert_eq!(owned_licences(3, &leases, ActorId::Hale), 4, "Hale still owns 4");
        assert_eq!(owned_licences(5, &leases, ActorId::You), 4, "You still owns 4");
        assert_eq!(owned_licences(0, &leases, ActorId::Okoro), 0);
        assert!(rent_covered(1_000, 1_000));
        assert!(!rent_covered(999, 1_000));
        assert!(!rent_covered(-5, 100));
    }
}
