//! What each captain reads before dawn.
//!
//! Brandt reads yesterday's best ground and Okoro reads yesterday's best
//! captain — but a zone nobody fishes has no observation in the journal, so a
//! captain who only ever reads the journal stays on the same collapsing bank
//! for ever. Two additions keep the reading honest: the follower tries a
//! ground nobody has fished in two weeks, and every tie is broken by the seed
//! rather than by the order of the array.

use std::cmp::Ordering;

use rules::debt::weekly_due;
use rules::state::{ActorId, Zone};

use crate::seed::draw_below;
use crate::Game;

/// Days between two tries at a ground nobody fishes.
pub(crate) const TRIES_EVERY: u64 = 5;
/// Days without a trip after which a ground counts as untried.
pub(crate) const UNFISHED_DAYS: usize = 14;
/// Purpose tags for the stateless seeded draws (see [`crate::seed::draw`]).
pub(crate) const TIE_ZONE: u64 = 1;
pub(crate) const TIE_CAPTAIN: u64 = 2;
pub(crate) const TRY_DAY: u64 = 3;
pub(crate) const TRY_ZONE: u64 = 4;

/// Best zone by yesterday's port catch per trip. Ties go to the seed, never
/// to the order of the array.
pub(crate) fn best_zone_yesterday(game: &Game) -> Option<Zone> {
    let yesterday = game.history.last()?;
    let mut top: Option<u64> = None;
    let mut tied: Vec<Zone> = Vec::new();
    for zone in Zone::all() {
        if game.closed[zone.idx()] {
            continue;
        }
        let trips = yesterday.trips[zone.idx()];
        if trips == 0 {
            continue;
        }
        let cpt = yesterday.crates[zone.idx()].saturating_mul(10) / trips;
        match top {
            Some(best) if cpt < best => continue,
            Some(best) if cpt == best => tied.push(zone),
            _ => {
                top = Some(cpt);
                tied = vec![zone];
            }
        }
    }
    let pick = draw_below(game.port.seed, game.port.day, TIE_ZONE, 0, tied.len() as u64);
    tied.get(pick as usize).copied()
}

/// Ground with no trip in the last two weeks, drawn by the seed.
pub(crate) fn untried_zone(game: &Game) -> Option<Zone> {
    let candidates: Vec<Zone> = Zone::all()
        .into_iter()
        .filter(|zone| !game.closed[zone.idx()])
        .filter(|zone| {
            game.recent(UNFISHED_DAYS)
                .iter()
                .all(|record| record.trips[zone.idx()] == 0)
        })
        .collect();
    let pick = draw_below(game.port.seed, game.port.day, TRY_ZONE, 0, candidates.len() as u64);
    candidates.get(pick as usize).copied()
}

/// Best gold-per-boat captain yesterday. Ties go to the seed.
pub(crate) fn best_captain_yesterday(game: &Game) -> Option<ActorId> {
    let yesterday = game.history.last()?;
    let mut top: Option<(i64, u64)> = None;
    let mut tied: Vec<ActorId> = Vec::new();
    for captain in ActorId::captains() {
        let boats = yesterday.boats_fished[captain.idx()];
        if boats == 0 {
            continue;
        }
        let earned = yesterday.gold_earned[captain.idx()];
        let order = match top {
            None => Ordering::Greater,
            Some((top_earned, top_boats)) => {
                (earned * top_boats as i64).cmp(&(top_earned * boats as i64))
            }
        };
        match order {
            Ordering::Less => continue,
            Ordering::Equal => tied.push(captain),
            Ordering::Greater => {
                top = Some((earned, boats));
                tied = vec![captain];
            }
        }
    }
    let pick = draw_below(game.port.seed, game.port.day, TIE_CAPTAIN, 0, tied.len() as u64);
    tied.get(pick as usize).copied()
}

/// A captain's own reading of next season's catch per trip, in tenths:
/// Hale her four-week mean, Brandt the best zone last week, Okoro the whole
/// fleet last week (TW-C1-04).
pub(crate) fn own_cpt_tenths(game: &Game, captain: ActorId) -> u64 {
    match captain {
        ActorId::Hale => {
            let mut crates = 0u64;
            let mut trips = 0u64;
            for record in game.recent(28) {
                crates += record.captain_crates[captain.idx()];
                trips += record.captain_trips[captain.idx()];
            }
            cpt_or_fallback(game, crates, trips)
        }
        ActorId::Brandt => best_zone_cpt(game),
        _ => fleet_cpt(game),
    }
}

/// Mean tenths, falling back to the fleet signal, then to 10 crates a trip.
fn cpt_or_fallback(game: &Game, crates: u64, trips: u64) -> u64 {
    if let Some(cpt) = crates.saturating_mul(10).checked_div(trips) {
        return cpt;
    }
    let fleet = fleet_cpt(game);
    if fleet > 0 {
        fleet
    } else {
        100
    }
}

/// Best open-zone weekly catch per trip in tenths (Brandt's reading).
fn best_zone_cpt(game: &Game) -> u64 {
    let mut trips = [0u64; 3];
    let mut crates = [0u64; 3];
    for record in game.recent(7) {
        for zone in Zone::all() {
            trips[zone.idx()] += record.trips[zone.idx()];
            crates[zone.idx()] += record.crates[zone.idx()];
        }
    }
    let mut best = 0u64;
    for zone in Zone::all() {
        if game.closed[zone.idx()] || trips[zone.idx()] == 0 {
            continue;
        }
        best = best.max(crates[zone.idx()].saturating_mul(10) / trips[zone.idx()]);
    }
    if best > 0 {
        best
    } else {
        100
    }
}

/// Fleet-wide weekly catch per trip in tenths (Okoro's reading).
fn fleet_cpt(game: &Game) -> u64 {
    let mut trips = 0u64;
    let mut crates = 0u64;
    for record in game.recent(7) {
        trips += record.trips.iter().sum::<u64>();
        crates += record.crates.iter().sum::<u64>();
    }
    crates.saturating_mul(10).checked_div(trips).unwrap_or(0)
}

/// Expected season profit under quota/closure/ban rules, on the captain's own
/// catch reading and last week's crate price.
/// Barreau 2: `levy` is the landing levy that would apply, centigold a crate.
pub(crate) fn season_profit(
    game: &Game,
    captain: ActorId,
    quota: u64,
    close_zone: Option<Zone>,
    ban_small_mesh: bool,
    levy: u64,
) -> i64 {
    let boats = game.boats_of(captain).len() as u64;
    let mut cpt = own_cpt_tenths(game, captain);
    let uses_small = game
        .boats_of(captain)
        .into_iter()
        .any(|index| game.port.boats[index].mesh == rules::state::Mesh::Small);
    if ban_small_mesh && uses_small {
        cpt = cpt.saturating_mul(10) / 14;
    }
    let price = game.last_week_crate_price().unwrap_or(game.config.base_herring);
    let (share_num, share_den) = match close_zone {
        None => (1, 1),
        Some(_) => (2, 3),
    };
    let fishable = boats * 7 * 3 * cpt / 10 * share_num / share_den;
    let allowance = game.port.licences[captain.idx()] * quota;
    let crates = fishable.min(allowance);
    let revenue = crates as i64 * price as i64;
    let levy_bill = rules::council::levy_week_cost(crates, levy);
    let wages = rules::debt::daily_charges(boats, &game.config) * 7;
    let dues: u64 = game
        .loans
        .iter()
        .filter(|loan| loan.borrower == captain)
        .map(|loan| weekly_due(loan, &game.config))
        .sum();
    (revenue - (wages + dues) as i64 - levy_bill) * game.config.weeks_per_season as i64
}
