//! Seeded game start: same seed, same season.
//!
//! [`seed_game`] builds the day-0 harbour (brief section 3 roster, section 4.1
//! full stocks) with every boat opening on Greybank, as in the brief's typical
//! session. Determinism rides on the stored seed threaded through the pure
//! rules (notably [`buy_estimate`](rules::survey::buy_estimate)); [`Rng`] is
//! the sim's splitmix64 stream for seeded draws on top of the rules.

use crate::{Fund, Game};
use rules::config::Config;
use rules::debt::Loan;
use rules::goldflow::Flows;
use rules::species::MeshLedger;
use rules::state::{ActorId, Harbour, Zone};
use serde::{Deserialize, Serialize};

/// Splitmix64 increment (odd constant, part of the algorithm definition).
const SPLITMIX_GAMMA: u64 = 0x9E37_79B9_7F4A_7C15;
/// Splitmix64 avalanche multipliers.
const SPLITMIX_M1: u64 = 0xBF58_476D_1CE4_E5B9;
const SPLITMIX_M2: u64 = 0x94D0_49BB_1331_11EB;

/// Deterministic RNG. Serialized with the state so saves stay replayable.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rng {
    state: u64,
}

impl Rng {
    /// Fresh stream from a seed. Seed 0 is a valid, ordinary seed.
    pub fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    /// Raw internal state (hashed into fingerprints).
    pub fn state(&self) -> u64 {
        self.state
    }

    /// Next 64-bit draw. Advances the stream.
    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(SPLITMIX_GAMMA);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(SPLITMIX_M1);
        z = (z ^ (z >> 27)).wrapping_mul(SPLITMIX_M2);
        z ^ (z >> 31)
    }

    /// Uniform draw in [0, n) via multiply-high (no modulo bias, no float).
    /// Returns 0 when n <= 1.
    pub fn below(&mut self, n: u64) -> u64 {
        if n <= 1 {
            return 0;
        }
        (((self.next_u64() as u128) * (n as u128)) >> 64) as u64
    }

    /// Uniform draw in [lo, hi). Returns lo when hi <= lo.
    pub fn gen_range(&mut self, lo: u64, hi: u64) -> u64 {
        if hi <= lo {
            return lo;
        }
        lo + self.below(hi - lo)
    }
}

/// Stateless seeded draw: the same `(seed, day, purpose, salt)` always gives
/// the same number, so a season replays exactly without a mutable stream to
/// thread through the rules or to serialise with the state.
pub fn draw(seed: u64, day: u64, purpose: u64, salt: u64) -> u64 {
    let key = seed
        ^ day.wrapping_mul(SPLITMIX_GAMMA)
        ^ purpose.wrapping_mul(SPLITMIX_M1)
        ^ salt.wrapping_mul(SPLITMIX_M2);
    let mut rng = Rng::new(key);
    rng.next_u64()
}

/// Seeded draw in `[0, n)`. Returns 0 when `n <= 1`.
pub fn draw_below(seed: u64, day: u64, purpose: u64, salt: u64, n: u64) -> u64 {
    if n <= 1 {
        return 0;
    }
    (((draw(seed, day, purpose, salt) as u128) * (n as u128)) >> 64) as u64
}

/// Brandt's opening debt: 738.5 gold at a tenth plus 3% a week, i.e. exactly
/// 96 gold due every Monday (brief section 2.3). Grandfathered before the
/// season, above the 300 gold cap on new notes.
fn brandt_seed_loan() -> Loan {
    Loan {
        id: crate::FIRST_LOAN_ID,
        borrower: ActorId::Brandt,
        boat: 4,
        principal: 73_850,
        outstanding: 73_850,
        paid_weeks: 0,
        missed: 0,
        holder: ActorId::Bank,
    }
}

/// Fresh game on `seed`: full stocks, section 3 purses and fleet, Brandt in
/// debt, every boat opening on Greybank.
pub fn seed_game(seed: u64) -> Game {
    let config = Config::default();
    let mut port = Harbour::foundation(&config, seed);
    for boat in port.boats.iter_mut() {
        boat.zone = Some(Zone::Greybank);
    }
    Game {
        config,
        port,
        loans: vec![brandt_seed_loan()],
        mesh: MeshLedger::new(),
        bailouts: Vec::new(),
        surveys: Vec::new(),
        favours: Vec::new(),
        proposal: None,
        player_vote: None,
        last_report: None,
        closed: [false; 3],
        small_mesh_banned: false,
        week_small: [0; 3],
        week_total: [0; 3],
        flows_total: Flows::default(),
        history: Vec::new(),
        next_loan_id: crate::FIRST_LOAN_ID + 1,
        next_boat_id: 10,
        over: false,
        bilan: None,
        last_council: None,
        campaign: Vec::new(),
        pending: None,
        lots_landed: 0,
        leases: Vec::new(),
        fund: Fund::default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rules::debt::weekly_due;

    #[test]
    fn same_seed_same_stream() {
        let (mut a, mut b) = (Rng::new(42), Rng::new(42));
        for _ in 0..100 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
        assert_eq!(a.state(), b.state());
    }

    #[test]
    fn bounded_draws_stay_in_range() {
        let mut rng = Rng::new(7);
        for _ in 0..1000 {
            assert!(rng.below(6) < 6);
            let v = rng.gen_range(10, 20);
            assert!((10..20).contains(&v));
        }
        assert_eq!(rng.below(0), 0);
        assert_eq!(rng.below(1), 0);
        assert_eq!(rng.gen_range(5, 5), 5);
    }

    #[test]
    fn seed_matches_brief_sections_2_and_3() {
        let game = seed_game(7);
        assert_eq!(game.port.stocks, [3000, 5000, 2000]);
        assert_eq!(game.port.boats.len(), 10);
        assert_eq!(game.port.total_licences(), 20);
        assert!(game
            .port
            .boats
            .iter()
            .all(|boat| boat.zone == Some(Zone::Greybank)));
        let due = weekly_due(&game.loans[0], &game.config);
        assert_eq!(due, 9_600, "Brandt owes 96 gold a week");
    }
}
