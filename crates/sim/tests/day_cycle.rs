//! One harbour day, end to end: trips and auction, regrowth, wages,
//! conservation every cycle, sustainable yield with two boats.
//!
//! The boat-count rules (five boats grind Greybank down, six empty it) live
//! in `lot0_core.rs`, the acceptance file; this one checks the yield.

mod helpers;

use helpers::{two_boat_equilibrium};
use rules::state::Zone;
use sim::cycle::run_day;
use sim::seed_game;

#[test]
fn full_week_keeps_the_books_balanced() {
    let mut game = seed_game(11);
    let mut sold_any = false;
    for _ in 0..7 {
        let report = run_day(&mut game);
        assert!(report.invariant_ok, "day {}: {:?}", report.day, report.lines);
        sold_any |= report.lines.iter().any(|line| line.contains("Sold to"));
    }
    assert!(sold_any, "the derby week must sell fish");
    assert_eq!(game.port.day, 7);
    assert_eq!(game.port.weekly_catch, [0; 10]);
}

#[test]
fn two_boats_hold_greybank_at_its_equilibrium() {
    let equilibrium = two_boat_equilibrium();
    let mut game = helpers::quiet_game(21);
    for _ in 0..150 {
        run_day(&mut game);
    }
    let stock = game.port.stocks[Zone::Greybank.idx()];
    assert!(
        stock.abs_diff(equilibrium) * 20 <= equilibrium,
        "stock {stock} against equilibrium {equilibrium}"
    );
    let last = game.history.last().expect("journal");
    let day_catch = last.crates[Zone::Greybank.idx()];
    let expected = 6 * game.config.catch_share_bps * stock / 10_000;
    assert!(
        day_catch.abs_diff(expected) * 10 <= expected,
        "daily catch {day_catch} against {expected}"
    );
}
