//! Shared fixtures for the Tidewater acceptance tests (brief section 10).
//!
//! Quiet harbours isolate one captain, and a week of fake journal gives the
//! council something to vote on. Same helpers, every lot: no duplication.

use rules::state::{ActorId, Boat, Mesh, Zone};
use sim::seed_game;
use sim::Game;

/// Harbour with the NPCs laid up, every licence with the player, no notes.
pub fn quiet_game(seed: u64) -> Game {
    let mut game = seed_game(seed);
    game.loans.clear();
    game.port.licences = [20, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for captain in [ActorId::Hale, ActorId::Brandt, ActorId::Okoro] {
        game.port.stopped[captain.idx()] = true;
    }
    game
}

/// Extra player boats on Greybank, on top of the two seeded ones.
pub fn add_boats(game: &mut Game, count: u64) {
    let first = game.next_boat_id;
    for id in first..first + count {
        game.port.boats.push(Boat {
            id,
            owner: ActorId::You,
            zone: Some(Zone::Greybank),
            mesh: Mesh::Large,
        });
        game.port.trips_today.push(0);
        game.next_boat_id += 1;
    }
}

/// Seven journal days with steady fishing, for council profit estimates.
pub fn week_old(game: &mut Game) {
    for day in 0..7 {
        let mut record = sim::DayRecord::new(day);
        record.trips = [3, 9, 3];
        record.crates = [30, 90, 18];
        record.lot_price_sum = 138 * 400;
        record.lot_crates = 138;
        game.history.push(record);
    }
    game.port.day = 7;
}

/// The stock two boats settle at on Greybank: where the daily take (two
/// boats, three trips each, `catch_share_bps` of the stock) meets the daily
/// regrowth. The rate is tuned by the balance harness, so the number comes
/// from the config instead of the brief's 2 600 crates.
pub fn two_boat_equilibrium() -> u64 {
    let config = rules::config::Config::default();
    let trips = 2 * config.trips_per_boat_day;
    let rate = config.regrow_herring_bps;
    let share = config.catch_share_bps;
    let capacity = config.zone_capacity[Zone::Greybank.idx()];
    capacity * (rate - trips * share) / rate
}
