//! The five answers of brief section 13, in code.
//!
//! - conservation of fish: **no** (nothing to build, TW-N-12 stands alone)
//! - score: **net worth only**, the sea is a stat, never a multiplier
//! - licences: **ceiling of 8 per captain**, so the council cannot be bought
//! - defeat: bilan, then straight into a new season
//! - season length: **configurable**, 14 days for the demo, 28 for the game

use rules::config::Config;
use rules::licences::cap_reached;
use rules::state::ActorId;
use sim::cycle::run_day;
use sim::season::roll_week;
use sim::{seed_game, Game};

/// Two weeks, the demo length: same rules, half the wait before the vote.
fn fortnight() -> Game {
    let mut game = seed_game(7);
    game.config.weeks_per_season = 2;
    game
}

#[test]
fn licence_ceiling_is_eight_per_captain() {
    let config = Config::default();
    assert_eq!(config.licence_cap_per_captain, 8);
    assert!(config.licence_cap_per_captain < config.licence_count);
    assert!(!cap_reached(7, 8, 1), "the eighth licence is allowed");
    assert!(cap_reached(8, 8, 1), "the ninth is not");
    assert!(!cap_reached(8, 0, 1), "a ceiling of zero means no ceiling");
}

#[test]
fn the_pool_refuses_a_ninth_licence() {
    let mut game = seed_game(7);
    game.port.licences[ActorId::You.idx()] = 8;
    game.port.gold[ActorId::You.idx()] = 100_000;
    let refused = game.pool_licence(ActorId::You, true);
    assert!(refused.is_err(), "{refused:?}");
    assert_eq!(game.port.licences[ActorId::You.idx()], 8);
    assert_eq!(game.port.gold[ActorId::You.idx()], 100_000, "nothing moved");
}

#[test]
fn npc_buyers_respect_the_ceiling_too() {
    let mut game = seed_game(7);
    game.port.licences[ActorId::Hale.idx()] = 8;
    game.port.gold[ActorId::Hale.idx()] = 500_000;
    game.port.weekly_catch[ActorId::Hale.idx()] = u64::MAX;
    let before = game.port.licences[ActorId::Hale.idx()];
    let mut closures = Vec::new();
    roll_week(&mut game, &mut closures);
    assert_eq!(game.port.licences[ActorId::Hale.idx()], before);
}

#[test]
fn a_fortnight_season_ends_after_fourteen_days() {
    let mut game = fortnight();
    let mut last = None;
    for _ in 0..14 {
        let report = run_day(&mut game);
        last = Some(report);
    }
    let report = last.expect("fourteen days ran");
    // Reports carry the day they close, the harbour its next dawn.
    assert_eq!(report.day, 13);
    assert_eq!(game.port.day, 14);
    assert!(report.season_over, "the council sits at the end of week 2");
    assert!(game.over);
    let bilan = game.bilan.clone().expect("a bilan closes the season");
    assert_eq!(bilan.stocks.len(), 3);
}

#[test]
fn the_bilan_scores_net_worth_and_never_the_sea() {
    let mut game = fortnight();
    for _ in 0..14 {
        run_day(&mut game);
    }
    let bilan = game.bilan.clone().expect("a bilan");
    let gold = game.port.gold[ActorId::You.idx()];
    let licences = game.port.licences[ActorId::You.idx()] as i64;
    let boats = game.boats_of(ActorId::You).len() as i64;
    let expected = gold
        + licences * bilan.licence_price as i64
        + boats * game.config.new_boat_cost as i64;
    assert_eq!(bilan.net_worth, expected, "purse + licences + hulls, nothing else");
    let stock_value: i64 = bilan.stocks.iter().map(|crates| *crates as i64 * 400).sum();
    assert!(stock_value > 0 || bilan.net_worth == expected, "the sea is a stat");
}
