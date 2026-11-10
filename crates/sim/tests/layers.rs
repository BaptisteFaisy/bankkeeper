//! Lots 1-4 acceptance: hidden stock, linked species, debt, council.
//!
//! A survey lands within 10% of the real stock, halving Greybank halves cod
//! capacity, small mesh catches 40% more and taxes regrowth, a broke captain
//! sails everything and loses its hull on the second miss, the player can buy
//! the note and grant a delay, and a fat indemnity flips an NPC vote.

mod helpers;

use helpers::week_old;
use rules::council::{Proposal, Vote};
use rules::species::{cod_capacity, effective_regrow_rate, mesh_catch, MeshLedger};
use rules::state::{ActorId, Mesh, Zone};
use rules::survey::buy_estimate;
use sim::bots::decide_all;
use sim::season::{roll_season, roll_week};
use sim::seed_game;

/// Lot 1: a survey reads within 10% of the real stock (TW-C1-03).
#[test]
fn survey_reads_within_10_percent_of_real_stock() {
    let config = rules::config::Config::default();
    for seed in 0..10 {
        for day in [0, 6, 27] {
            for zone in Zone::all() {
                let estimate = buy_estimate(3000, seed, day, zone, &config);
                assert!((2700..=3300).contains(&estimate), "{estimate}");
            }
        }
    }
    let mut game = seed_game(7);
    let survey = game.buy_survey(ActorId::You, Zone::Greybank).expect("survey");
    assert!((4500..=5500).contains(&survey.estimate), "{:?}", survey);
}

/// Lot 2: halving Greybank halves the Deeps cod capacity (TW-C2-01).
#[test]
fn halving_greybank_halves_deeps_cod_capacity() {
    let config = rules::config::Config::default();
    assert_eq!(cod_capacity(5000, &config), 2000);
    assert_eq!(cod_capacity(2500, &config), 1000);
    assert_eq!(cod_capacity(0, &config), 0);
}

/// Lot 2: small mesh lands 40% more now and halves regrowth later (TW-C2).
#[test]
fn small_mesh_catches_more_and_taxes_regrowth() {
    let config = rules::config::Config::default();
    assert_eq!(mesh_catch(100, Mesh::Small, &config), 140);
    assert_eq!(mesh_catch(100, Mesh::Large, &config), 100);
    assert_eq!(effective_regrow_rate(500, 0, &config), 500);
    assert_eq!(effective_regrow_rate(500, 10_000, &config), 250);
    let mut ledger = MeshLedger::new();
    for _ in 0..4 {
        ledger.record_week([0, 200, 0], [0, 200, 0]);
    }
    let share = ledger.share_bps(Zone::Greybank);
    assert_eq!(share, 10_000);
    assert_eq!(effective_regrow_rate(500, share, &config), 250);
}

/// Lot 3: a captain short for its payment sails every boat (TW-C3-04).
#[test]
fn npc_short_for_payment_sends_all_boats() {
    let mut game = seed_game(7);
    game.port.gold[ActorId::Brandt.idx()] = 0;
    let lines = decide_all(&mut game);
    let boats = game.boats_of(ActorId::Brandt);
    assert_eq!(boats.len(), 4);
    for index in boats {
        let boat = &game.port.boats[index];
        assert!(boat.zone.is_some(), "every boat sails");
        assert_eq!(boat.mesh, Mesh::Small, "on small mesh");
    }
    let journal = lines.join("\n");
    assert!(journal.contains("small mesh"), "{journal}");
    assert!(journal.contains("short"), "{journal}");
}

/// Lot 3: two missed payments seize the hull (TW-C3-03).
#[test]
fn two_missed_payments_trigger_seizure() {
    let mut game = seed_game(7);
    game.port.gold[ActorId::Brandt.idx()] = 0;
    let mut closures = Vec::new();
    let first = roll_week(&mut game, &mut closures);
    assert!(first.iter().any(|line| line.contains("misses")), "{first:?}");
    game.port.gold[ActorId::Brandt.idx()] = 0;
    let second = roll_week(&mut game, &mut closures);
    assert!(
        second.iter().any(|line| line.contains("seized")),
        "{second:?}"
    );
    assert!(game.loans.is_empty());
    assert!(game.boats_of(ActorId::Brandt).len() < 4);
}

/// Lot 3: the player buys the note, then grants a delay (TW-C3-05).
#[test]
fn player_buys_debt_and_grants_forbearance() {
    let mut game = seed_game(7);
    let id = game.loans[0].id;
    game.port.gold[ActorId::You.idx()] = 1_000_000;
    game.buy_note(ActorId::You, id).expect("buyout");
    assert_eq!(game.loans[0].holder, ActorId::You);
    game.loans[0].missed = 1;
    game.defer_loan(ActorId::You, id).expect("delay");
    assert_eq!(game.loans[0].missed, 0);
    assert!(game.defer_loan(ActorId::Bank, id).is_err());
}

/// Lot 4: the council sits, and a fat indemnity flips an NPC vote (TW-C4).
#[test]
fn seasonal_vote_happens_and_indemnity_flips_an_npc_vote() {
    let lean = roll_with_indemnity(0);
    assert!(lean.tabled);
    let ballot = lean.ballots.iter().find(|(voter, _, _)| *voter == ActorId::Brandt);
    assert_eq!(ballot.map(|(_, vote, _)| *vote), Some(Vote::Against));
    assert!(lean.lines.iter().any(|line| line.contains("votes no")), "{:?}", lean.lines);
    assert!(lean.lines.iter().any(|line| line.contains("costs him")), "{:?}", lean.lines);

    let fat = roll_with_indemnity(50_000);
    assert!(fat.tabled);
    let ballot = fat.ballots.iter().find(|(voter, _, _)| *voter == ActorId::Brandt);
    assert_eq!(ballot.map(|(_, vote, _)| *vote), Some(Vote::For));
    assert!(fat.tally.passed);
    assert!(fat.lines.iter().any(|line| line.contains("votes yes")), "{:?}", fat.lines);
    assert!(fat.lines.iter().any(|line| line.contains("offer pays")), "{:?}", fat.lines);
}

/// One season-end vote on a 10-crate quota with the given indemnity.
fn roll_with_indemnity(per_licence_week: u64) -> sim::season::CouncilReport {
    let mut game = seed_game(5);
    week_old(&mut game);
    game.port.gold[ActorId::You.idx()] = 10_000_000;
    game.propose(Proposal {
        quota_per_licence: 10,
        close_zone: None,
        ban_small_mesh: false,
        indemnity_per_licence_week: per_licence_week,
        levy_per_crate: None,
    });
    roll_season(&mut game)
}
