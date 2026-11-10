//! Pure tidewater rules shared by the contract entry points.
//!
//! Mirrors the `rules` crate crate values (brief sections 4, 5 and 12):
//! catches, logistic regrowth, buyer limits, licence pricing and the
//! council vote personalities. Everything here is a pure function, so the
//! offchain sim replays these exact rules and fast-forward can never
//! disagree with the chain.

use crate::{
    ProposalKind, CATCH_SHARE_BPS, COD_BASE_MILLI, FLOOR_DIVISOR, HERRING_BASE_MILLI,
    MILLIS_PER_GOLD, STOCK_GAIN_BPS,
};

/// Crates taken by one trip: 0.4 % of the zone stock (TW-N-02).
/// Small mesh adds 40 % (TW-C2, layer 2).
pub fn catch_of(stock: u64, small_mesh: bool) -> u64 {
    let base = stock * CATCH_SHARE_BPS / 10_000;
    if small_mesh {
        base * 140 / 100
    } else {
        base
    }
}

/// Logistic regrowth at end of day (TW-N-03). Zero never regrows (TW-N-04).
/// Small-mesh pressure halves the rate at worst (layer 2).
pub fn regrow(stock: u64, capacity: u64, rate_bps: u64, small_mesh_share_bps: u64) -> u64 {
    if stock == 0 || capacity == 0 || stock >= capacity {
        return 0;
    }
    let damaged = rate_bps * (10_000 - small_mesh_share_bps.min(10_000) / 2) / 10_000;
    stock * damaged / 10_000 * (capacity - stock) / capacity
}

/// Buyer limit = base x (1 + 0.5 x relative gap to target) (TW-N-31, S12).
/// Over target the factor drops below 1 (TW-N-32).
pub fn buyer_limit_milli(base_milli: u64, stock: u64, target: u64) -> u64 {
    // Same rule as the sim, same file: `rules::merchant`. Units do not matter,
    // every step is a ratio.
    rules::merchant::limit(base_milli, stock, target, STOCK_GAIN_BPS)
}

/// Base price in milli-gold for a species token.
pub fn base_of(species: &str) -> u64 {
    match species {
        crate::COD_TOKEN => COD_BASE_MILLI,
        _ => HERRING_BASE_MILLI,
    }
}

/// Weekly landing quota for a captain holding `licences` (TW-N-20).
pub fn quota_of(licences: u64, per_licence: u64) -> u64 {
    licences * per_licence
}

/// Licence price follows the income it promises (TW-C4-04): one week of
/// quota at the recent crate price, scaled by sea health, floored at 50.
/// The brief gives no formula: this one is ours.
pub fn licence_price_milli(avg_price_milli: u64, health_bps: u64, per_licence: u64) -> u64 {
    let estimate = per_licence * avg_price_milli * health_bps.min(10_000) / 10_000;
    estimate.max(50 * MILLIS_PER_GOLD)
}

/// Sea health: total stock over total capacity, in basis points.
pub fn stock_health_bps(stocks: &[(u64, u64)]) -> u64 {
    let (stock, capacity) = stocks.iter().fold((0u64, 0u64), |(s, c), (a, b)| {
        (s.saturating_add(*a), c.saturating_add(*b))
    });
    if capacity == 0 {
        return 0;
    }
    stock * 10_000 / capacity
}

/// A lot below every buyer limit still needs the floor (TW-N-33).
pub fn floor_of(base_milli: u64) -> u64 {
    base_milli / FLOOR_DIVISOR
}

/// Descending clock: the first (highest) limit at or above the floor wins.
pub fn clear_auction(bids: &[(String, u64)], floor_milli: u64) -> Option<(String, u64)> {
    bids.iter()
        .filter(|(_, limit)| *limit >= floor_milli)
        .max_by_key(|(_, limit)| *limit)
        .map(|(buyer, limit)| (buyer.clone(), *limit))
}

/// Context for one NPC vote: its own licences, the sea it reads, the offer.
pub struct VoteCtx {
    pub licences: u64,
    pub avg_price_milli: u64,
    pub health_bps: u64,
    pub zone_health_bps: u64,
    pub current_quota: u64,
    pub indemnity_season_milli: u64,
}

/// One NPC vote with its displayed reasoning (TW-C4-02, TW-C4-05).
/// Hale is prudent, Brandt counts his gold, Okoro copies the richest.
pub fn evaluate_vote(captain: &str, kind: &ProposalKind, ctx: &VoteCtx) -> (bool, String) {
    match kind {
        ProposalKind::QuotaPerLicence(next) => vote_quota(captain, *next, ctx),
        ProposalKind::CloseZone(zone) => vote_close_zone(captain, *zone, ctx),
        ProposalKind::BanSmallMesh(ban) => vote_mesh(captain, *ban, ctx),
    }
}

fn season_loss_milli(current: u64, next: u64, licences: u64, avg_price_milli: u64) -> u64 {
    if next >= current {
        return 0;
    }
    (current - next) * licences * 4 * avg_price_milli
}

fn vote_quota(captain: &str, next: u64, ctx: &VoteCtx) -> (bool, String) {
    let loss = season_loss_milli(ctx.current_quota, next, ctx.licences, ctx.avg_price_milli);
    let offer = ctx.indemnity_season_milli * ctx.licences;
    match captain {
        "marta" => {
            let yes = next <= ctx.current_quota && (ctx.health_bps < 7_000 || offer >= loss);
            (yes, format!("Hale votes {}: quota {} vs {}, sea at {}%.", yes_word(yes), next, ctx.current_quota, ctx.health_bps / 100))
        }
        "brandt" => {
            let yes = offer >= loss;
            (yes, format!("Brandt votes {}: a {}-crate quota costs him {} a season, your offer pays {}.", yes_word(yes), next, loss / MILLIS_PER_GOLD, offer / MILLIS_PER_GOLD))
        }
        _ => {
            let yes = offer >= loss;
            (yes, format!("Okoro votes {}: follows the money, offer {} vs loss {}.", yes_word(yes), offer / MILLIS_PER_GOLD, loss / MILLIS_PER_GOLD))
        }
    }
}

fn vote_close_zone(captain: &str, zone: u8, ctx: &VoteCtx) -> (bool, String) {
    let loss = ctx.licences * ctx.current_quota * ctx.avg_price_milli / 3 / MILLIS_PER_GOLD;
    let offer = ctx.indemnity_season_milli * ctx.licences / MILLIS_PER_GOLD;
    match captain {
        "marta" => {
            let yes = ctx.zone_health_bps < 5_000 || offer >= loss;
            (yes, format!("Hale votes {}: zone {} at {}% of capacity.", yes_word(yes), zone, ctx.zone_health_bps / 100))
        }
        "brandt" => {
            let yes = offer >= loss;
            (yes, format!("Brandt votes {}: closing zone {} costs him {} a season, your offer pays {}.", yes_word(yes), zone, loss, offer))
        }
        _ => {
            let yes = offer >= loss;
            (yes, format!("Okoro votes {}: follows the money, offer {} vs loss {}.", yes_word(yes), offer, loss))
        }
    }
}

fn vote_mesh(captain: &str, ban: bool, ctx: &VoteCtx) -> (bool, String) {
    if !ban {
        return (true, format!("{} votes yes: keeping small mesh costs nobody.", captain));
    }
    let loss = ctx.licences * ctx.current_quota * 4 * ctx.avg_price_milli * 40 / 140;
    let offer = ctx.indemnity_season_milli * ctx.licences;
    match captain {
        "marta" => (true, "Hale votes yes: small mesh kills tomorrow's catch.".to_string()),
        "brandt" => {
            let yes = offer >= loss;
            (yes, format!("Brandt votes {}: the mesh ban costs him {} a season, your offer pays {}.", yes_word(yes), loss / MILLIS_PER_GOLD, offer / MILLIS_PER_GOLD))
        }
        _ => {
            let yes = offer >= loss;
            (yes, format!("Okoro votes {}: follows the money.", yes_word(yes)))
        }
    }
}

fn yes_word(yes: bool) -> &'static str {
    if yes {
        "yes"
    } else {
        "no"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trip_takes_four_per_mille() {
        assert_eq!(catch_of(5_000, false), 20);
        assert_eq!(catch_of(5_000, true), 28);
        assert_eq!(catch_of(0, false), 0);
    }

    #[test]
    fn dead_stock_never_regrows() {
        assert_eq!(regrow(0, 5_000, 500, 0), 0);
        assert_eq!(regrow(5_000, 5_000, 500, 0), 0);
    }

    #[test]
    fn regrow_peaks_mid_capacity() {
        let low = regrow(1_000, 5_000, 500, 0);
        let mid = regrow(2_500, 5_000, 500, 0);
        assert!(mid > low);
        let damaged = regrow(2_500, 5_000, 500, 10_000);
        assert_eq!(damaged, mid / 2);
    }

    #[test]
    fn brief_example_limits() {
        // Cannery: base 4.0, stock 180 of 150 -> 3.6, then 194 -> 3.4-ish.
        assert_eq!(buyer_limit_milli(4_000, 180, 150), 3_600);
        assert_eq!(buyer_limit_milli(4_000, 194, 150), 3_413);
        assert_eq!(buyer_limit_milli(4_000, 150, 150), 4_000);
    }

    #[test]
    fn clock_picks_highest_above_floor() {
        let bids = vec![("cannery".to_string(), 3_600), ("fishmonger".to_string(), 3_200)];
        assert_eq!(clear_auction(&bids, 1_000), Some(("cannery".to_string(), 3_600)));
        assert_eq!(clear_auction(&bids, 4_000), None);
        assert_eq!(clear_auction(&[], 1_000), None);
    }

    #[test]
    fn quota_and_licence_price() {
        assert_eq!(quota_of(4, 70), 280);
        assert_eq!(licence_price_milli(4_000, 10_000, 70), 280_000);
        assert_eq!(licence_price_milli(4_000, 0, 70), 50_000);
    }

    #[test]
    fn npc_votes_follow_personality() {
        let ctx = VoteCtx {
            licences: 8,
            avg_price_milli: 4_000,
            health_bps: 8_000,
            zone_health_bps: 8_000,
            current_quota: 70,
            indemnity_season_milli: 0,
        };
        let (yes, why) = evaluate_vote("brandt", &ProposalKind::QuotaPerLicence(50), &ctx);
        assert!(!yes);
        assert!(why.contains("Brandt votes no"));
        let rich = VoteCtx { indemnity_season_milli: 400_000, ..ctx_like(&ctx) };
        let (yes, _) = evaluate_vote("brandt", &ProposalKind::QuotaPerLicence(50), &rich);
        assert!(yes);
        let (yes, _) = evaluate_vote("marta", &ProposalKind::BanSmallMesh(true), &ctx);
        assert!(yes);
    }

    fn ctx_like(ctx: &VoteCtx) -> VoteCtx {
        VoteCtx {
            licences: ctx.licences,
            avg_price_milli: ctx.avg_price_milli,
            health_bps: ctx.health_bps,
            zone_health_bps: ctx.zone_health_bps,
            current_quota: ctx.current_quota,
            indemnity_season_milli: 0,
        }
    }
}
