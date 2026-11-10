//! Unit tests for the player and judge views (`views.rs`), kept out of the
//! module so it stays under the file-size budget.

use super::*;
use crate::seed_game;

#[test]
fn pieces_and_names_match_the_brief_lines() {
    assert_eq!(gold_pieces(5040), 50.4);
    assert_eq!(gold_pieces(-120), -1.2);
    assert_eq!(weekday(0), "Mon");
    assert_eq!(weekday(7), "Mon");
    assert_eq!(tide(0), "High");
    assert_eq!(zone_id(Zone::Deeps), "deeps");
    assert_eq!(actor_id(ActorId::Gull), "gull");
    assert_eq!(boat_name(0), "Skua");
    assert_eq!(boat_name(1), "Tern");
}

#[test]
fn state_view_matches_the_port_shape() {
    let game = seed_game(7);
    let state = view_state(&game);
    assert_eq!(state["week"], 1);
    assert_eq!(state["day"], "Mon");
    assert_eq!(state["seed"], "7");
    assert_eq!(state["zones"].as_array().unwrap().len(), 3);
    assert_eq!(state["boats"].as_array().unwrap().len(), 10);
    assert_eq!(state["captains"].as_array().unwrap().len(), 4);
    assert_eq!(state["buyers"].as_array().unwrap().len(), 3);
    assert_eq!(state["auction"]["lot"], Value::Null);
    assert_eq!(state["licences"], 4);
    let judges = view_judges(&game);
    assert_eq!(judges["actors"].as_array().unwrap().len(), 10);
    assert!(!judges["loans"].as_array().unwrap().is_empty());
}
