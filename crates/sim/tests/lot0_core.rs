//! Lot 0 acceptance: the core loop holds together (brief section 10).
//!
//! Two boats on Greybank sit near 2,600 crates and 62 crates a day, five
//! boats empty the zone, the section 4.4 auction pays 3.6 then 3.4, gold is
//! conserved every cycle, and a playerless season runs clean and repeats.

mod helpers;

use helpers::{add_boats, quiet_game};
use rules::auction::{bid_limit, clear, sale_reasoning, Buyer, Lot, Outcome};
use rules::config::Config;
use rules::state::{ActorId, Species, Zone};
use sim::cycle::run_day;
use sim::fastforward::{history_hash, run};
use sim::seed_game;

fn cannery(stock: u64, gold: i64) -> Buyer {
    Buyer {
        actor: ActorId::Cannery,
        stock,
        target: 150,
        gold,
        buys: true,
        open: true,
    }
}

/// Lot 0: two boats hold Greybank near 2,600 crates and ~62 crates a day.
#[test]
fn two_boats_stabilize_greybank_near_2600_and_62_a_day() {
    let mut game = quiet_game(21);
    for _ in 0..150 {
        run_day(&mut game);
    }
    let stock = game.port.stocks[Zone::Greybank.idx()];
    assert!((2300..=2900).contains(&stock), "stock {stock}");
    let last = game.history.last().expect("journal");
    let daily = last.crates[Zone::Greybank.idx()];
    assert!((47..=77).contains(&daily), "daily catch {daily}");
}

/// Lot 0: five boats empty Greybank (brief: "Cinq bateaux le vident").
#[test]
fn five_boats_empty_greybank() {
    let mut game = quiet_game(22);
    add_boats(&mut game, 3);
    for _ in 0..200 {
        run_day(&mut game);
    }
    let stock = game.port.stocks[Zone::Greybank.idx()];
    assert!(
        stock < 500,
        "five boats must empty Greybank, {stock} crates left"
    );
}

/// Lot 0: the section 4.4 example pays 3.6, then the limit falls to 3.4.
#[test]
fn auction_section_44_example_yields_36_then_34() {
    let config = Config::default();
    let lot = Lot {
        species: Species::Herring,
        crates: 14,
    };
    let buyers = vec![
        cannery(180, 300_000),
        Buyer {
            actor: ActorId::Fishmonger,
            stock: 90,
            target: 60,
            gold: 60_000,
            buys: true,
            open: true,
        },
        Buyer {
            actor: ActorId::Gull,
            stock: 0,
            target: 0,
            gold: 40_000,
            buys: false,
            open: true,
        },
    ];
    let outcome = clear(&lot, &buyers, &config);
    assert_eq!(
        outcome,
        Outcome::Sold {
            buyer: ActorId::Cannery,
            price: 360,
            total: 5040,
        }
    );
    assert_eq!(rules::format_price(360), "3.6");
    let after = bid_limit(400, 194, 150, &config);
    assert_eq!(rules::format_price(after), "3.4");
    assert_eq!(
        sale_reasoning("Cannery", 14, 360, 400, 9000, 180, 150),
        "Sold to Cannery: 14 x 3.6 = 50.4. Limit 3.6 = base 4.0 x 0.90."
    );
}

/// Lot 0: TW-N-42 holds on every single day cycle, on several seeds.
#[test]
fn gold_conservation_holds_every_cycle() {
    for seed in [7, 11, 42] {
        let mut game = seed_game(seed);
        for _ in 0..28 {
            let report = run_day(&mut game);
            assert!(report.invariant_ok, "seed {seed} day {}", report.day);
        }
    }
}

/// Lot 0: a 28-day season with no player runs clean, on several seeds.
#[test]
fn season_without_player_runs_clean_on_several_seeds() {
    for seed in [1, 7, 9, 42, 123] {
        let mut game = seed_game(seed);
        let result = run(&mut game, 28);
        assert_eq!(result.days_run, 28, "seed {seed}");
        assert_eq!(result.history.len(), 28, "seed {seed}");
        assert!(
            result.events.iter().any(|e| e.kind == "council"),
            "seed {seed}: the council must sit"
        );
        assert!(
            !result.events.iter().any(|e| e.kind == "invariant"),
            "seed {seed}: no conservation fault allowed"
        );
    }
}

/// Lot 0: same seed, same season (TW-J-04).
#[test]
fn same_seed_same_season() {
    let mut first_game = seed_game(7);
    let mut second_game = seed_game(7);
    let first = run(&mut first_game, 28);
    let second = run(&mut second_game, 28);
    assert_eq!(history_hash(&first.history), history_hash(&second.history));
    assert_eq!(
        first.final_game.gold_total(),
        second.final_game.gold_total()
    );
    assert_eq!(first.events.len(), second.events.len());
}
