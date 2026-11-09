//! TW-N-50..53: broke captains, closed buyers, bailouts.
//!
//! A captain at zero gold or below at end of week lays up: boats to quay,
//! licences to the auction pool (TW-N-50). A buyer at zero closes and stops
//! bidding (TW-N-51). The player may bail a stopped actor out and then take
//! a share of its profits (TW-N-52). Stops read on the map without text
//! (TW-N-53); these predicates feed those visuals.

use crate::config::Config;
use crate::state::{ActorId, Harbour};

/// True when the purse is empty or overdrawn: the actor stops (TW-N-50/51).
pub fn is_broke(gold: i64) -> bool {
    gold <= 0
}

/// Captains who must lay up this week (still sailing and broke).
pub fn broke_captains(port: &Harbour) -> Vec<ActorId> {
    ActorId::captains()
        .into_iter()
        .filter(|captain| !port.stopped[captain.idx()] && is_broke(port.gold[captain.idx()]))
        .collect()
}

/// Buyers who must close this week (still open and broke).
pub fn broke_buyers(port: &Harbour) -> Vec<ActorId> {
    ActorId::buyers()
        .into_iter()
        .filter(|buyer| !port.stopped[buyer.idx()] && is_broke(port.gold[buyer.idx()]))
        .collect()
}

/// Lay up a captain: boats to quay, licences to the auction pool (TW-N-50).
pub fn lay_up(port: &mut Harbour, captain: ActorId) {
    debug_assert!(captain.is_captain());
    for boat in port.boats.iter_mut().filter(|boat| boat.owner == captain) {
        boat.zone = None;
    }
    let index = captain.idx();
    port.licence_pool += port.licences[index];
    port.licences[index] = 0;
    port.stopped[index] = true;
}

/// Close a buyer: it stops bidding (TW-N-51).
pub fn close_buyer(port: &mut Harbour, buyer: ActorId) {
    debug_assert!(buyer.is_buyer());
    port.stopped[buyer.idx()] = true;
}

/// Total owed to the rescuer: rescue gold x 150% cap (TW-N-52).
pub fn bailout_owed(rescue_gold: u64, config: &Config) -> u64 {
    rescue_gold.saturating_mul(config.bailout_cap_bps) / 10_000
}

/// Rescuer cut on one profit, capped by what is still owed (TW-N-52).
pub fn bailout_payout(profit: u64, owed: u64, config: &Config) -> u64 {
    (profit.saturating_mul(config.bailout_share_bps) / 10_000).min(owed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn port() -> Harbour {
        Harbour::foundation(&Config::default(), 3)
    }

    #[test]
    fn broke_means_zero_or_less() {
        assert!(is_broke(0));
        assert!(is_broke(-5));
        assert!(!is_broke(1));
    }

    #[test]
    fn lay_up_grounds_boats_and_pools_licences() {
        let mut port = port();
        port.gold[ActorId::Brandt.idx()] = 0;
        port.boats[4].zone = Some(crate::state::Zone::Greybank);
        assert_eq!(broke_captains(&port), vec![ActorId::Brandt]);
        lay_up(&mut port, ActorId::Brandt);
        assert!(port.boats[4..8].iter().all(|boat| boat.zone.is_none()));
        assert_eq!(port.licences[ActorId::Brandt.idx()], 0);
        assert_eq!(port.licence_pool, 8);
        assert_eq!(port.total_licences(), 20);
        assert!(port.stopped[ActorId::Brandt.idx()]);
    }

    #[test]
    fn closed_buyer_stops_and_bailout_pays_until_cap() {
        let cfg = Config::default();
        let mut port = port();
        port.gold[ActorId::Gull.idx()] = -10;
        assert_eq!(broke_buyers(&port), vec![ActorId::Gull]);
        close_buyer(&mut port, ActorId::Gull);
        assert!(port.stopped[ActorId::Gull.idx()]);
        assert_eq!(bailout_owed(10_000, &cfg), 15_000);
        assert_eq!(bailout_payout(10_000, 15_000, &cfg), 2_000);
        assert_eq!(bailout_payout(10_000, 500, &cfg), 500);
    }
}
