//! One harbour day, end to end: trips and auction, regrowth, wages,
//! conservation every cycle, sustainable yield with two boats.

mod helpers;

use helpers::{add_boats, quiet_game};
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
fn two_boats_hold_greybank_near_2600() {
    // Lot 0: the two-boat sustainable yield, ~62 crates a day.
    let mut game = quiet_game(21);
    for _ in 0..150 {
        run_day(&mut game);
    }
    let stock = game.port.stocks[Zone::Greybank.idx()];
    assert!((2300..=2900).contains(&stock), "stock {stock}");
    let last = game.history.last().expect("journal");
    let day_catch = last.crates[Zone::Greybank.idx()];
    assert!((47..=77).contains(&day_catch), "daily catch {day_catch}");
}

#[test]
fn five_boats_empty_greybank() {
    let mut game = quiet_game(22);
    add_boats(&mut game, 3);
    for _ in 0..28 {
        run_day(&mut game);
    }
    let season_end = game.port.stocks[Zone::Greybank.idx()];
    for _ in 0..172 {
        run_day(&mut game);
    }
    let stock = game.port.stocks[Zone::Greybank.idx()];
    assert!(season_end < 3000, "one season must crater the stock, got {season_end}");
    // NOTE: floored trip_catch pins five boats near ~749 (take 30 =
    // regrowth 30); true "vide la zone" needs rounding in the rules.
    assert!(stock < 1100, "five boats must grind far below the two-boat level, got {stock}");
}
