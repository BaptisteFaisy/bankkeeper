//! Core game invariants: display helpers, boat assignment, refloat, notes and
//! the licence price.

use rules::state::{ActorId, Mesh, Zone};
use sim::{fmt_gold, fmt_tenths, seed_game, DayRecord, Game};

fn game() -> Game {
    seed_game(7)
}

#[test]
fn display_helpers_match_the_brief_lines() {
    assert_eq!(fmt_gold(5_040), "50.4");
    assert_eq!(fmt_gold(-120), "-1.2");
    assert_eq!(fmt_tenths(98), "9.8");
    assert_eq!(fmt_tenths(152), "15.2");
}

#[test]
fn assignment_refuses_closed_zones_and_banned_mesh() {
    let mut game = game();
    game.closed[Zone::Greybank.idx()] = true;
    assert!(game.assign_boat(ActorId::You, 0, Some(Zone::Greybank), Mesh::Large).is_err());
    game.small_mesh_banned = true;
    assert!(game.assign_boat(ActorId::You, 0, Some(Zone::Shallows), Mesh::Small).is_err());
}

#[test]
fn nets_switch_at_quay_only() {
    let mut game = game();
    assert!(game.assign_boat(ActorId::You, 0, Some(Zone::Shallows), Mesh::Small).is_err());
    game.assign_boat(ActorId::You, 0, None, Mesh::Large).unwrap();
    game.assign_boat(ActorId::You, 0, None, Mesh::Small).unwrap();
}

#[test]
fn refloat_reopens_and_records_the_share() {
    let mut game = game();
    game.port.stopped[ActorId::Brandt.idx()] = true;
    game.refloat(ActorId::You, ActorId::Brandt, 5_000).unwrap();
    assert!(!game.port.stopped[ActorId::Brandt.idx()]);
    assert_eq!(game.bailouts.len(), 1);
    assert!(game.refloat(ActorId::You, ActorId::Brandt, 5_000).is_err());
}

#[test]
fn debt_commands_move_the_note() {
    let mut game = game();
    let id = game.loans[0].id;
    assert!(game.buy_note(ActorId::You, 999).is_err());
    game.port.gold[ActorId::You.idx()] = 1_000_000;
    game.buy_note(ActorId::You, id).unwrap();
    assert_eq!(game.loans[0].holder, ActorId::You);
    game.loans[0].missed = 1;
    game.defer_loan(ActorId::You, id).unwrap();
    assert_eq!(game.loans[0].missed, 0);
    assert!(game.defer_loan(ActorId::Bank, id).is_err());
}

#[test]
fn licence_price_tracks_recent_yield() {
    let mut game = game();
    assert_eq!(game.licence_price_now(), game.config.base_licence_price);
    let mut record = DayRecord::new(0);
    record.lot_price_sum = 3_500;
    record.lot_crates = 10;
    game.history.push(record);
    assert_eq!(game.licence_price_now(), 350 * 70);
}
