//! The day journal: one finished day, as the NPCs and the judges read it.
//!
//! Split out of `lib.rs` so the crate root keeps one screen per subject and
//! stays under the structural line budget. The record is pure data plus two
//! folds; the engine owns the rules that fill it.

use rules::state::{Mesh, Zone};
use serde::{Deserialize, Serialize};

/// One finished day, as the NPCs and the judges read it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayRecord {
    pub day: u64,
    /// Trips sailed and crates landed per zone.
    pub trips: [u64; 3],
    pub crates: [u64; 3],
    /// Trips sailed and crates landed per captain.
    pub captain_trips: [u64; 10],
    pub captain_crates: [u64; 10],
    /// Auction revenue and boats that fished, per captain.
    pub gold_earned: [i64; 10],
    pub boats_fished: [u64; 10],
    /// First zone fished and mesh used (small if any small trip), per captain.
    pub fished_zone: [Option<Zone>; 10],
    pub fished_mesh: [Mesh; 10],
    /// Crates-weighted herring lot price (0 when no herring sold).
    pub herring_price: u64,
    pub herring_crates: u64,
    /// Price x crates summed over all lots, and total lot crates.
    pub lot_price_sum: u64,
    pub lot_crates: u64,
    pub gold_total: i64,
}

impl DayRecord {
    /// Blank record for a day about to run.
    pub fn new(day: u64) -> Self {
        Self {
            day,
            trips: [0; 3],
            crates: [0; 3],
            captain_trips: [0; 10],
            captain_crates: [0; 10],
            gold_earned: [0; 10],
            boats_fished: [0; 10],
            fished_zone: [None; 10],
            fished_mesh: [Mesh::Large; 10],
            herring_price: 0,
            herring_crates: 0,
            lot_price_sum: 0,
            lot_crates: 0,
            gold_total: 0,
        }
    }

    /// Fold one herring sale into the crates-weighted average price.
    pub fn add_herring_sale(&mut self, price: u64, crates: u64) {
        let sum = self.herring_price as u128 * self.herring_crates as u128
            + price as u128 * crates as u128;
        self.herring_crates += crates;
        self.herring_price = (sum / self.herring_crates as u128) as u64;
    }
}
