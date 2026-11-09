//! TW-C2: linked species and mesh choice.
//!
//! Cod in the Deeps feed on Greybank herring: cod capacity scales with the
//! Greybank stock (TW-C2-01). Small mesh lands 40% more now but slows the
//! zone regrowth, up to half, with the small-mesh share of the last four
//! weeks (TW-C2-03). Every boat carries one net, switched at quay (TW-C2-02).

use serde::{Deserialize, Serialize};

use crate::config::Config;
use crate::state::{Mesh, Zone};

/// Rolling four-week window of weeks recorded per zone.
pub const MESH_WINDOW_WEEKS: usize = 4;

/// Cod capacity in the Deeps: 2000 x Greybank stock / 5000 (TW-C2-01).
pub fn cod_capacity(greybank_stock: u64, config: &Config) -> u64 {
    let greybank_cap = config.zone_capacity[Zone::Greybank.idx()];
    if greybank_cap == 0 {
        return 0;
    }
    (config.zone_capacity[Zone::Deeps.idx()] as u128 * greybank_stock as u128
        / greybank_cap as u128)
        .min(u64::MAX as u128) as u64
}

/// Landed crates after the mesh bonus: x1.4 on small mesh (TW-C2).
pub fn mesh_catch(catch: u64, mesh: Mesh, config: &Config) -> u64 {
    match mesh {
        Mesh::Large => catch,
        Mesh::Small => {
            (catch as u128 * config.mesh_bonus_bps as u128 / 10_000u128).min(u64::MAX as u128)
                as u64
        }
    }
}

/// Small-mesh share of a zone catch in bps (TW-C2-03 input).
pub fn small_mesh_share_bps(small_crates: u64, total_crates: u64) -> u64 {
    if total_crates == 0 {
        return 0;
    }
    (small_crates as u128 * 10_000u128 / total_crates as u128).min(10_000) as u64
}

/// Regrowth rate after the small-mesh penalty: all small mesh halves it.
pub fn effective_regrow_rate(base_rate_bps: u64, share_bps: u64, config: &Config) -> u64 {
    let penalty = share_bps.min(10_000) / 2;
    let penalty = penalty.min(config.mesh_penalty_max_bps);
    base_rate_bps.saturating_mul(10_000 - penalty) / 10_000
}

/// Four-week rolling ledger of small-mesh pressure, per zone.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MeshLedger {
    small: [[u64; MESH_WINDOW_WEEKS]; 3],
    total: [[u64; MESH_WINDOW_WEEKS]; 3],
    weeks: u64,
}

impl MeshLedger {
    /// Empty ledger: no small-mesh history anywhere.
    pub fn new() -> Self {
        Self {
            small: [[0; MESH_WINDOW_WEEKS]; 3],
            total: [[0; MESH_WINDOW_WEEKS]; 3],
            weeks: 0,
        }
    }

    /// Record one week of catches for all three zones (same call, same week).
    pub fn record_week(&mut self, small: [u64; 3], total: [u64; 3]) {
        let slot = self.weeks as usize % MESH_WINDOW_WEEKS;
        for zone in Zone::all() {
            self.small[zone.idx()][slot] = small[zone.idx()];
            self.total[zone.idx()][slot] = total[zone.idx()];
        }
        self.weeks += 1;
    }

    /// Small-mesh share of a zone over the recorded window, in bps.
    pub fn share_bps(&self, zone: Zone) -> u64 {
        let small: u64 = self.small[zone.idx()].iter().sum();
        let total: u64 = self.total[zone.idx()].iter().sum();
        small_mesh_share_bps(small, total)
    }
}

impl Default for MeshLedger {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> Config {
        Config::default()
    }

    #[test]
    fn halving_greybank_halves_cod_capacity() {
        let cfg = config();
        assert_eq!(cod_capacity(5000, &cfg), 2000);
        assert_eq!(cod_capacity(2500, &cfg), 1000);
        assert_eq!(cod_capacity(0, &cfg), 0);
    }

    #[test]
    fn small_mesh_catches_more_and_regrows_less() {
        let cfg = config();
        assert_eq!(mesh_catch(10, Mesh::Small, &cfg), 14);
        assert_eq!(mesh_catch(10, Mesh::Large, &cfg), 10);
        assert_eq!(effective_regrow_rate(500, 0, &cfg), 500);
        assert_eq!(effective_regrow_rate(500, 10_000, &cfg), 250);
        assert_eq!(effective_regrow_rate(500, 5_000, &cfg), 375);
    }

    #[test]
    fn ledger_rolls_over_four_weeks() {
        let mut ledger = MeshLedger::new();
        assert_eq!(ledger.share_bps(Zone::Greybank), 0);
        ledger.record_week([0, 100, 0], [0, 100, 0]);
        assert_eq!(ledger.share_bps(Zone::Greybank), 10_000);
        for _ in 0..4 {
            ledger.record_week([0, 0, 0], [0, 100, 0]);
        }
        assert_eq!(ledger.share_bps(Zone::Greybank), 0);
    }
}
