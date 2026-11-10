//! Weeks and seasons: quotas reset, notes settle, the council sits.
//!
//! Monday settlement keeps licences conserved; a tabled motion is voted and
//! applied, while a motionless council votes nothing and says so (B2).

mod helpers;

use helpers::week_old;
use rules::council::Proposal;
use rules::state::{ActorId, Zone};
use sim::season::{roll_season, roll_week};
use sim::seed_game;

#[test]
fn monday_resets_quotas_and_records_mesh() {
    let mut game = seed_game(5);
    game.port.weekly_catch[ActorId::Hale.idx()] = 200;
    game.week_small = [10, 0, 0];
    game.week_total = [100, 0, 0];
    let mut closures = Vec::new();
    roll_week(&mut game, &mut closures);
    assert_eq!(game.port.weekly_catch, [0; 10]);
    assert_eq!(game.mesh.share_bps(Zone::Shallows), 1000);
    assert!(closures.is_empty());
}

#[test]
fn broke_captain_lays_up_and_pools_licences() {
    let mut game = seed_game(5);
    game.port.gold[ActorId::Brandt.idx()] = 0;
    let mut closures = Vec::new();
    roll_week(&mut game, &mut closures);
    assert_eq!(closures, vec![ActorId::Brandt]);
    assert_eq!(game.port.total_licences(), 20);
}

#[test]
fn fat_indemnity_flips_a_vote_and_pays() {
    let mut game = seed_game(5);
    week_old(&mut game);
    game.port.gold[ActorId::You.idx()] = 10_000_000;
    game.propose(Proposal {
        quota_per_licence: 10,
        close_zone: None,
        ban_small_mesh: false,
        indemnity_per_licence_week: 50_000,
    });
    let report = roll_season(&mut game);
    assert!(report.tabled);
    assert!(report.tally.passed, "{:?}", report.lines);
    assert!(report.lines.iter().any(|line| line.contains("votes yes")), "{:?}", report.lines);
    assert_eq!(game.config.quota_per_licence, 10);
}

#[test]
fn no_motion_skips_the_vote_and_keeps_the_rules() {
    let mut game = seed_game(5);
    week_old(&mut game);
    let quota = game.config.quota_per_licence;
    let report = roll_season(&mut game);
    assert!(!report.tabled);
    assert!(report.ballots.is_empty());
    assert_eq!(report.tally.for_votes, 0);
    assert_eq!(report.tally.against_votes, 0);
    assert!(!report.tally.passed);
    assert_eq!(
        report.lines,
        vec!["Council of season 0: no motion tabled; the standing rules continue.".to_string()]
    );
    assert_eq!(game.config.quota_per_licence, quota);
}
