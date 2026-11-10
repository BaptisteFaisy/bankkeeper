//! What each captain reads before dawn.
//!
//! Brandt reads yesterday's best ground and Okoro reads yesterday's best
//! captain — but a zone nobody fishes has no observation in the journal, so a
//! captain who only ever reads the journal stays on the same collapsing bank
//! for ever. Two additions keep the reading honest: the follower tries a
//! ground nobody has fished in two weeks, and every tie is broken by the seed
//! rather than by the order of the array.

use std::cmp::Ordering;

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
