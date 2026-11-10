//! Fast-forward: a week or a season compressed for the judges.
//!
//! Runs N days back to back with the NPC cast and no player, recording one
//! graph point and the notable events per day. Deterministic for a given
//! (state, seed): the same seed replays the same season, so demos are
//! reproducible and CI pins a golden hash.

use crate::{cycle::DayReport, cycle::run_day, season::CouncilReport, Game};
use serde::{Deserialize, Serialize};

/// Judge runs: one week and one full season (TW-J-01).
pub const WEEK_DAYS: u64 = 7;
pub const SEASON_DAYS: u64 = 28;

/// One graph point: real stocks, herring price, purses, licences, gold circuit
/// (TW-J-02..03).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayPoint {
    pub day: u64,
    pub stocks: [u64; 3],
    pub herring_price: u64,
    pub gold: [i64; 10],
    pub licences: [u64; 10],
    pub gold_total: i64,
    pub ext_in: u64,
    pub ext_out: u64,
}

/// Notable event for the fast-forward timeline markers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FfEvent {
    pub day: u64,
    pub kind: String,
    pub detail: String,
}

/// Full fast-forward output: graph series, event journal, final game.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FastForwardResult {
    pub days_run: u64,
    pub seed: u64,
    pub history: Vec<DayPoint>,
    pub events: Vec<FfEvent>,
    pub final_game: Game,
}

/// Run `days` days with no player: their boats stay beached at quay.
pub fn run(game: &mut Game, days: u64) -> FastForwardResult {
    if !game.over {
        for boat in game.port.boats.iter_mut().filter(|boat| boat.owner == rules::state::ActorId::You) {
            boat.zone = None;
        }
    }
    let mut history = Vec::new();
    let mut events = Vec::new();
    let mut days_run = 0u64;
    for _ in 0..days {
        if game.over {
            break;
        }
        let report = run_day(game);
        collect_events(&report, &mut events);
        history.push(snapshot(game));
        days_run += 1;
    }
    FastForwardResult {
        days_run,
        seed: game.port.seed,
        history,
        events,
        final_game: game.clone(),
    }
}

/// Run one judge week (7 days).
pub fn run_week(game: &mut Game) -> FastForwardResult {
    run(game, WEEK_DAYS)
}

/// Run one judge season (28 days, council vote included).
pub fn run_season(game: &mut Game) -> FastForwardResult {
    run(game, SEASON_DAYS)
}

/// Journal the closures, council votes and conservation faults of one day.
fn collect_events(report: &DayReport, events: &mut Vec<FfEvent>) {
    for actor in &report.closures {
        events.push(FfEvent {
            day: report.day,
            kind: "closure".to_string(),
            detail: format!("{} stopped (out of gold)", actor.name()),
        });
    }
    for line in &report.lines {
        if line.contains("seized") {
            events.push(FfEvent {
                day: report.day,
                kind: "seizure".to_string(),
                detail: line.clone(),
            });
        }
    }
    if let Some(council) = &report.council {
        events.push(FfEvent {
            day: report.day,
            kind: "council".to_string(),
            detail: council_event_detail(council),
        });
    }
    if !report.invariant_ok {
        events.push(FfEvent {
            day: report.day,
            kind: "invariant".to_string(),
            detail: "gold conservation fault".to_string(),
        });
    }
}

/// Council timeline text: the vote count when a motion was tabled, an
/// honest no-motion line otherwise (B2).
fn council_event_detail(council: &CouncilReport) -> String {
    if !council.tabled {
        return format!(
            "season {} council: no motion tabled; the standing rules continue.",
            council.season
        );
    }
    format!(
        "season {} vote: {} for, {} against, {}",
        council.season,
        council.tally.for_votes,
        council.tally.against_votes,
        if council.tally.passed { "passed" } else { "failed" }
    )
}

/// One graph point from the live game.
pub fn snapshot(game: &Game) -> DayPoint {
    DayPoint {
        day: game.port.day,
        stocks: game.port.stocks,
        herring_price: game.history.last().map(|record| record.herring_price).unwrap_or(0),
        gold: game.port.gold,
        licences: game.port.licences,
        gold_total: game.gold_total(),
        ext_in: game.flows_total.exports + game.flows_total.travellers,
        ext_out: game.flows_total.fuel_bait,
    }
}

/// FNV-1a hash of the graph series: the determinism fingerprint.
///
/// Every column a season can differ in must go in, or a regression in that
/// column passes the golden hash unseen: stocks, prices, purses, the licence
/// map and the outer flows (exports, travellers, fuel and bait).
pub fn history_hash(history: &[DayPoint]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for point in history {
        hash = mix(hash, point.day);
        for stock in point.stocks {
            hash = mix(hash, stock);
        }
        hash = mix(hash, point.herring_price);
        hash = mix(hash, point.gold_total as u64);
        for purse in point.gold {
            hash = mix(hash, purse as u64);
        }
        for licences in point.licences {
            hash = mix(hash, licences);
        }
        hash = mix(hash, point.ext_in);
        hash = mix(hash, point.ext_out);
    }
    hash
}

fn mix(hash: u64, value: u64) -> u64 {
    hash.wrapping_mul(0x100000001b3).wrapping_add(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::seed_game;

    #[test]
    fn same_seed_same_season() {
        let mut a = seed_game(7);
        let mut b = seed_game(7);
        let first = run(&mut a, SEASON_DAYS);
        let second = run(&mut b, SEASON_DAYS);
        assert_eq!(history_hash(&first.history), history_hash(&second.history));
        assert_eq!(first.final_game.gold_total(), second.final_game.gold_total());
        assert_eq!(first.events.len(), second.events.len());
    }

    #[test]
    fn season_runs_clean_and_votes() {
        let mut game = seed_game(9);
        let result = run(&mut game, SEASON_DAYS);
        assert_eq!(result.days_run, 28);
        assert_eq!(result.final_game.port.day, 28);
        assert!(result.history.len() == 28);
        assert!(result.events.iter().any(|event| event.kind == "council"));
        assert!(!result.events.iter().any(|event| event.kind == "invariant"));
    }

    #[test]
    fn season_is_fast() {
        let mut game = seed_game(7);
        let start = std::time::Instant::now();
        run(&mut game, SEASON_DAYS);
        assert!(start.elapsed().as_secs() < 60, "a season must run in under a minute");
    }
}
