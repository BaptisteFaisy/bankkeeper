//! TW-N-40..42: the gold circuit and its conservation check.
//!
//! Gold enters only through exported preserves and inn travellers, and leaves
//! only through imported fuel and bait (TW-N-40). An unsold lot destroys
//! goods, never gold (TW-N-41). Every cycle, the sim checks that the change
//! in total gold equals the net outside flows (TW-N-42).

use serde::{Deserialize, Serialize};

/// Outside gold flows of one cycle, in centigold. Trades between actors are
/// internal moves and never appear here.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Flows {
    /// Cannery preserves sold abroad (inflow).
    pub exports: u64,
    /// Travellers spending at the inn (inflow).
    pub travellers: u64,
    /// Fuel and bait bought from abroad (outflow).
    pub fuel_bait: u64,
    /// Juveniles bought abroad to reseed a zone (outflow, barreau 4): the
    /// port fund spends the gold outside the harbour, the crates come back.
    #[serde(default)]
    pub reseed: u64,
}

impl Flows {
    /// Net outside flow: inflows minus outflows (may be negative).
    pub fn net(&self) -> i64 {
        let inflow = self.exports.saturating_add(self.travellers);
        let outflow = self.fuel_bait.saturating_add(self.reseed);
        (inflow as i128 - outflow as i128)
            .clamp(i64::MIN as i128, i64::MAX as i128) as i64
    }

    /// Record an export sale (inflow).
    pub fn add_exports(&mut self, amount: u64) {
        self.exports = self.exports.saturating_add(amount);
    }

    /// Record traveller spending (inflow).
    pub fn add_travellers(&mut self, amount: u64) {
        self.travellers = self.travellers.saturating_add(amount);
    }

    /// Record a fuel and bait purchase (outflow).
    pub fn add_fuel_bait(&mut self, amount: u64) {
        self.fuel_bait = self.fuel_bait.saturating_add(amount);
    }

    /// Record a reseed purchase abroad (outflow, barreau 4).
    pub fn add_reseed(&mut self, amount: u64) {
        self.reseed = self.reseed.saturating_add(amount);
    }
}

/// TW-N-42: the change in total gold must equal the net outside flows.
pub fn check_conservation(total_before: i64, total_after: i64, flows: &Flows) -> bool {
    total_after.saturating_sub(total_before) == flows.net()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn internal_trades_keep_the_total_flat() {
        let flows = Flows::default();
        assert!(check_conservation(1_065_000, 1_065_000, &flows));
        assert!(!check_conservation(1_065_000, 1_065_001, &flows));
    }

    #[test]
    fn outside_flows_move_the_total() {
        let mut flows = Flows::default();
        flows.add_exports(5_000);
        flows.add_travellers(1_000);
        flows.add_fuel_bait(2_000);
        assert_eq!(flows.net(), 4_000);
        assert!(check_conservation(100_000, 104_000, &flows));
    }

    #[test]
    fn net_outflow_is_negative() {
        let mut flows = Flows::default();
        flows.add_fuel_bait(700);
        assert_eq!(flows.net(), -700);
        assert!(check_conservation(100_000, 99_300, &flows));
    }
}
