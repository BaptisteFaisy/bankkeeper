//! The balance harness: aggregates, determinism, policies, degenerate seeds.
//!
//! Four short checks the report rests on: the five-number summary is the one
//! the docs quote, a seed replays its campaign exactly, each policy really
//! moves the player's boats, and a hostile seed does not panic the grid.

use rules::state::{ActorId, Mesh, Zone};
use sim::harness::{percentile, run_one, summarise, RunResult, Stats};
use sim::policies::{self, Policy};
use sim::seed_game;

/// Player boats as (zone, mesh) pairs, in fleet order.
fn player_fleet(game: &sim::Game) -> Vec<(Option<Zone>, Mesh)> {
    game.boats_of(ActorId::You)
        .into_iter()
        .map(|index| {
            let boat = &game.port.boats[index];
            (boat.zone, boat.mesh)
        })
        .collect()
}

#[test]
fn five_number_summary_is_exact() {
    let stats = Stats::of(&[40, 10, 30, 20]);
    assert_eq!(
        stats,
        Stats {
            median: 25,
            p10: 13,
            p90: 37,
            min: 10,
            max: 40
        }
    );
    assert_eq!(percentile(&[], 50), 0);
    assert_eq!(percentile(&[7], 90), 7);
    assert_eq!(Stats::of(&[5]).median, 5);
}

#[test]
fn aggregates_count_bankruptcies_per_policy() {
    let run = |net_worth: i64, bankrupt: bool| RunResult {
        seed: 1,
        policy: Policy::Greedy,
        net_worth,
        gold: net_worth,
        licences: 4,
        licence_price: 35_000,
        boats: 2,
        stocks: [1_000, 500, 200],
        season_stocks: vec![[1_000, 500, 200]],
        bankruptcies: u64::from(bankrupt),
        first_bankruptcy_day: bankrupt.then_some(13),
        days_played: 84,
        history_hash: "0".to_string(),
    };
    let summary = summarise(&[run(100, false), run(300, true), run(200, true)]);
    assert_eq!(summary.runs, 3);
    assert_eq!(summary.net_worth.median, 200);
    assert_eq!(summary.bankrupt_runs, 2);
    assert_eq!(summary.bankrupt_share_bps, 6_666);
    assert_eq!(summary.median_first_bankruptcy_day, Some(13));
    assert_eq!(summary.stocks["greybank"].median, 500);
    assert_eq!(summary.stocks["deeps"].min, 200);
}

#[test]
fn same_seed_same_campaign_hash() {
    let first = run_one(3, Policy::Greedy, 1);
    let second = run_one(3, Policy::Greedy, 1);
    assert_eq!(first.history_hash, second.history_hash);
    assert_eq!(first.net_worth, second.net_worth);
    assert_eq!(first.stocks, second.stocks);
    assert_eq!(first.days_played, 28);
    assert_eq!(first.season_stocks.len(), 1);
    let other = run_one(4, Policy::Greedy, 1);
    assert_ne!(first.history_hash, other.history_hash);
}

#[test]
fn each_policy_places_the_boats_its_own_way() {
    let mut passive = seed_game(7);
    policies::opening(Policy::Passive, &mut passive);
    assert!(player_fleet(&passive).iter().all(|(zone, _)| zone.is_none()));
    assert!(policies::morning(Policy::Passive, &mut passive).is_empty());

    let mut greedy = seed_game(7);
    let lines = policies::morning(Policy::Greedy, &mut greedy);
    assert!(!lines.is_empty());
    assert!(player_fleet(&greedy)
        .iter()
        .all(|(zone, mesh)| zone.is_some() && *mesh == Mesh::Small));

    let mut steward = seed_game(7);
    policies::morning(Policy::Steward, &mut steward);
    assert!(player_fleet(&steward)
        .iter()
        .all(|(_, mesh)| *mesh == Mesh::Large));
    assert!(steward.proposal.is_some(), "the steward tables a quota cut");
    assert_ne!(player_fleet(&greedy), player_fleet(&steward));

    // Mixed opens on the greedy season, so its first dawn is the greedy one.
    let mut mixed = seed_game(7);
    policies::morning(Policy::Mixed, &mut mixed);
    assert_eq!(player_fleet(&mixed), player_fleet(&greedy));
}

#[test]
fn idle_player_is_laid_up_on_day_thirteen() {
    let run = run_one(7, Policy::Passive, 1);
    assert_eq!(run.bankruptcies, 1);
    assert_eq!(run.first_bankruptcy_day, Some(13));
    assert!(run.gold < 0);
}

#[test]
fn degenerate_seeds_do_not_panic() {
    let zero = run_one(0, Policy::Passive, 0);
    assert_eq!(zero.days_played, 28, "zero seasons still plays one");
    let hostile = run_one(u64::MAX, Policy::Mixed, 1);
    assert!(hostile.days_played >= 28);
    assert!(!hostile.history_hash.is_empty());
}
