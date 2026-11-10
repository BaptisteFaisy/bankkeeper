//! Seeds must mean something (TW-J-04).
//!
//! Same seed, same season — and two seeds must actually give two seasons.
//! The first version of the engine threaded a seed but no rule ever drew on
//! it: seeds 7, 11 and 23 produced a bit-identical season, and only Greybank
//! was ever fished, because every NPC read the same journal of the same
//! single ground.

use rules::state::Zone;
use sim::cycle::run_day;
use sim::fastforward::{history_hash, run};
use sim::seed_game;

fn season_hash(seed: u64) -> u64 {
    let mut game = seed_game(seed);
    let result = run(&mut game, 28);
    history_hash(&result.history)
}

/// `stocks` start at capacity (3000 / 5000 / 2000), so a drop means a trip.
fn grounds_fished(seed: u64) -> Vec<Zone> {
    let capacity = [3000u64, 5000, 2000];
    let mut game = seed_game(seed);
    let result = run(&mut game, 28);
    let mut visited = Vec::new();
    for zone in Zone::all() {
        let fished = result
            .history
            .iter()
            .any(|point| point.stocks[zone.idx()] < capacity[zone.idx()]);
        if fished {
            visited.push(zone);
        }
    }
    visited
}

#[test]
fn same_seed_replays_the_same_season() {
    assert_eq!(season_hash(7), season_hash(7));
    assert_eq!(season_hash(42), season_hash(42));
}

#[test]
fn different_seeds_give_different_seasons() {
    let hashes: Vec<u64> = [7, 11, 23, 42, 99]
        .iter()
        .map(|seed| season_hash(*seed))
        .collect();
    for (index, left) in hashes.iter().enumerate() {
        for right in &hashes[index + 1..] {
            assert_ne!(left, right, "two seeds produced the same season: {hashes:?}");
        }
    }
}

#[test]
fn every_ground_is_fished_over_a_season() {
    let mut all_three = false;
    for seed in 7..=12 {
        if grounds_fished(seed).len() == 3 {
            all_three = true;
        }
    }
    assert!(all_three, "no seed ever fished the three grounds");
}

#[test]
fn untried_grounds_get_tried_and_said_so() {
    let mut announced = false;
    for seed in 7..=12 {
        let mut game = seed_game(seed);
        for _ in 0..28 {
            let report = run_day(&mut game);
            if report.lines.iter().any(|line| line.contains("Okoro tries")) {
                announced = true;
            }
        }
    }
    assert!(announced, "the follower never tries a ground nobody fishes");
}
