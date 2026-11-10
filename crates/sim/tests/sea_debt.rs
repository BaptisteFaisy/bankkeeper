//! Barreau 4 — the debt owed to the sea.
//!
//! Five things have to hold: a season that stays under the sustainable catch
//! owes nothing; a season over it owes exactly the surplus; the debt survives
//! `open_next_season`; paying it in fallow takes off exactly the regrowth the
//! resting zone performs; and the gold ledger still balances, reseeding
//! included.

use rules::config::Config;
use rules::sea::{fallow_credit, season_debt};
use rules::state::Zone;
use sim::cycle::run_day;
use sim::sea::{accrue, season_bill, season_days};
use sim::{seed_game, DayRecord, Game};

/// A journal day: one zone, one captain, `crates` landed.
fn day(game: &mut Game, zone: Zone, crates: u64) {
    let mut record = DayRecord::new(game.history.len() as u64);
    record.crates[zone.idx()] = crates;
    record.captain_crates[0] = crates;
    record.fished_zone[0] = Some(zone);
    game.history.push(record);
}

/// A harbour whose Greybank holds `stock` crates, with an empty journal.
fn harbour(stock: u64) -> Game {
    let mut game = seed_game(7);
    game.history.clear();
    game.port.stocks[Zone::Greybank.idx()] = stock;
    game
}

/// Greybank's own ceiling a day, the figure the register prints too.
fn ceiling(game: &Game) -> u64 {
    let stock = game.port.stocks[Zone::Greybank.idx()];
    let rate = game.config.regrow_rate(Config::zone_species(Zone::Greybank));
    rules::stocks::sustainable_catch(stock, game.config.zone_capacity[Zone::Greybank.idx()], rate)
}

/// (a) A season that stays under the sustainable catch owes the sea nothing.
#[test]
fn a_season_under_the_ceiling_owes_nothing() {
    // Greybank at 2,500 of 5,000 gives back 87 crates a day at the tuned
    // 7% regrowth; 60 taken a day over a 28-day season is 1,680 against a
    // budget of 2,436.
    let mut game = harbour(2_500);
    assert_eq!(ceiling(&game), 87);
    for _ in 0..season_days(&game) {
        day(&mut game, Zone::Greybank, 60);
    }
    let bill = season_bill(&game);
    assert_eq!(bill.taken[Zone::Greybank.idx()], 1_680);
    assert_eq!(bill.zones[Zone::Greybank.idx()], 0);
    assert_eq!(bill.total, 0, "a light season leaves no bill");
    assert_eq!(accrue(&mut game).carried, 0);
    assert_eq!(game.sea_debt, 0);
}

/// (b) A season over the ceiling owes exactly the surplus, crate for crate.
#[test]
fn a_season_over_the_ceiling_owes_the_surplus() {
    // 100 taken a day for 28 days: 2,800 against the 2,436 the zone can give
    // back, so 364 crates of debt — and no more, no less.
    let mut game = harbour(2_500);
    for _ in 0..season_days(&game) {
        day(&mut game, Zone::Greybank, 100);
    }
    let bill = season_bill(&game);
    let budget = ceiling(&game) * season_days(&game);
    assert_eq!(bill.taken[Zone::Greybank.idx()], 2_800);
    assert_eq!(bill.zones[Zone::Greybank.idx()], 2_800 - budget);
    assert_eq!(bill.total, 364);
    assert_eq!(bill.total, season_debt(2_800, 87, 28));

    let carried = accrue(&mut game).carried;
    assert_eq!(carried, 364);
    assert_eq!(game.sea_debt, 364, "the season's bill is written down once");

    // Accruing twice must not double-count: the second reading is the same
    // bill, so the liability stays where the first one put it.
    let again = accrue(&mut game);
    assert_eq!(again.total, 364);
}

/// A second season adds to the first: the campaign accumulates, it never
/// forgets.
#[test]
fn two_seasons_accumulate() {
    let mut game = harbour(2_500);
    for _ in 0..season_days(&game) {
        day(&mut game, Zone::Greybank, 100);
    }
    assert_eq!(accrue(&mut game).carried, 364);
    assert_eq!(accrue(&mut game).carried, 728);
    assert_eq!(game.sea_debt, 728);
}

/// (c) The debt is a campaign liability: `open_next_season` carries it, the
/// same way it carries the stocks.
#[test]
fn the_debt_survives_open_next_season() {
    let mut game = seed_game(7);
    for _ in 0..28 {
        run_day(&mut game);
    }
    assert!(game.over, "the season closed on day 28");
    let debt = game.sea_debt;
    assert!(debt > 0, "a real season leaves a real bill, got {debt}");
    let bilan = game.bilan.clone().expect("a bilan");
    assert_eq!(bilan.sea_debt_total, debt, "the bilan shows the liability");
    assert!(bilan.sea_debt > 0, "and the season's own line");

    assert_eq!(sim::season::open_next_season(&mut game), Ok(2));
    assert_eq!(game.sea_debt, debt, "the next campaign starts with the debt");
    assert_eq!(game.campaign[0].sea_debt_total, debt, "archived in the log");
}

/// (d) Paying in fallow takes off exactly the regrowth the resting zone
/// performs, closes the zone, and never takes the debt below zero.
#[test]
fn fallow_pays_with_the_regrowth_it_buys() {
    let mut game = harbour(2_500);
    game.sea_debt = 5_000;
    let rate = game.config.regrow_rate(Config::zone_species(Zone::Greybank));

    // One week of rest on Greybank: 87 crates a day x 7 = 609.
    let expected = fallow_credit(2_500, 5_000, rate, game.config.days_per_week);
    assert_eq!(expected, 609);
    let paid = game.pay_in_fallow(Zone::Greybank, 1).expect("fallow");
    assert_eq!(paid, 609);
    assert_eq!(game.sea_debt, 5_000 - 609);
    assert!(game.closed[Zone::Greybank.idx()], "the zone is shut");
    assert_eq!(game.fallow_left(Zone::Greybank), 1);

    // Four weeks: 2,436 crates, and the counter stacks.
    let paid = game.pay_in_fallow(Zone::Greybank, 4).expect("fallow");
    assert_eq!(paid, 609 * 4);
    assert_eq!(game.fallow_left(Zone::Greybank), 5);

    // A debt smaller than the credit is paid off, not driven negative.
    game.sea_debt = 10;
    let paid = game.pay_in_fallow(Zone::Greybank, 1).expect("fallow");
    assert_eq!(paid, 10);
    assert_eq!(game.sea_debt, 0);

    // Nothing owed, nothing to pay: the desk says so rather than resting a
    // zone for nothing.
    assert!(game.pay_in_fallow(Zone::Greybank, 1).is_err());
    assert!(game.pay_in_fallow(Zone::Greybank, 0).is_err());
}

/// A fallow keeps the zone shut across the Monday settlements it spans, and
/// reopens it on the week its last day is served.
#[test]
fn a_fallow_closes_the_zone_for_its_weeks() {
    let mut game = harbour(2_500);
    game.sea_debt = 5_000;
    game.pay_in_fallow(Zone::Greybank, 2).expect("fallow");
    assert!(game.closed[Zone::Greybank.idx()]);

    let mut closures = Vec::new();
    let lines = sim::season::roll_week(&mut game, &mut closures);
    assert!(game.closed[Zone::Greybank.idx()], "one week left, still shut");
    assert_eq!(game.fallow_left(Zone::Greybank), 1);
    assert!(lines.iter().any(|line| line.contains("fallow")));

    sim::season::roll_week(&mut game, &mut closures);
    assert!(!game.closed[Zone::Greybank.idx()], "the fallow is served");
    assert_eq!(game.fallow_left(Zone::Greybank), 0);
}

/// Reseeding spends the port fund, puts the crates back in the sea and takes
/// them off the debt — and refuses a purchase the fund cannot cover.
#[test]
fn reseeding_spends_the_fund_and_restores_the_zone() {
    let mut game = harbour(2_500);
    game.sea_debt = 1_000;
    game.fund.balance = 1_000_000;
    let price = game.last_week_crate_price().unwrap_or(game.config.base_herring);

    let gold_before = game.gold_total();
    let spent = game.pay_in_reseed(Zone::Greybank, 200).expect("reseed");
    assert_eq!(spent, 200 * price, "200 crates at the going price");
    assert_eq!(game.sea_debt, 800);
    assert_eq!(game.port.stocks[Zone::Greybank.idx()], 2_700);
    assert_eq!(game.gold_total(), gold_before - spent as i64);
    assert_eq!(game.flows_total.reseed, spent, "booked as an outside purchase");

    // A dry fund buys nothing.
    game.fund.balance = 0;
    assert!(game.pay_in_reseed(Zone::Greybank, 10).is_err());
    assert_eq!(game.sea_debt, 800);

    // A reseed bigger than the debt is cut down to the debt.
    game.fund.balance = 10_000_000;
    game.pay_in_reseed(Zone::Greybank, 5_000).expect("reseed");
    assert_eq!(game.sea_debt, 0);
    assert!(game.pay_in_reseed(Zone::Greybank, 10).is_err());
}

/// (e) The gold ledger still balances with the debt in it: every day of a
/// campaign that pays the sea keeps `delta == outside flows`.
#[test]
fn gold_is_conserved_while_the_sea_is_paid() {
    for seed in [7u64, 11, 42] {
        let mut game = seed_game(seed);
        for day in 0..28 {
            assert!(balances(&mut game), "seed {seed} day {day}");
        }
        assert!(game.over, "seed {seed}: the season closed");
        assert!(game.sea_debt > 0, "seed {seed}: a real season owes");

        // Pay part of it both ways and keep counting.
        game.fund.balance = 5_000_000;
        game.pay_in_fallow(Zone::Greybank, 1).expect("fallow");
        game.pay_in_reseed(Zone::Greybank, 100).expect("reseed");
        assert!(balances(&mut game), "seed {seed}: the day after paying");
    }
}

/// The audit's conservation reading, reseeding included: the change in total
/// gold equals the net outside flow.
fn balances(game: &mut Game) -> bool {
    let before = game.gold_total();
    let flows = game.flows_total.clone();
    run_day(game);
    let delta = game.gold_total() - before;
    let inflow = (game.flows_total.exports - flows.exports
        + game.flows_total.travellers - flows.travellers) as i64;
    let outflow = (game.flows_total.fuel_bait - flows.fuel_bait
        + game.flows_total.reseed - flows.reseed) as i64;
    delta == inflow - outflow
}
