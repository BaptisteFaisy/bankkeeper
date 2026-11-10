//! Barreau 5 — Réparer : the collective fallow and the claim against the fund.
//!
//! Obligatory tests:
//! (a) a voted fallow closes the zone for N weeks and regrowth continues,
//! (b) the fund compensates and gold is conserved,
//! (c) one claim per season maximum,
//! (d) a won claim is paid by the fund / a lost claim costs credibility,
//! (e) credibility changes the admission or voting of future motions,
//! (f) determinism holds (same seed -> same history hash).

use rules::council::{Funding, Proposal};
use rules::dispute::{ClaimOutcome, CLAIM_LOST_CREDIBILITY_PENALTY, PROPOSER_CREDIBILITY_FLOOR};
use rules::state::{ActorId, Zone};
use sim::cycle::run_day;
use sim::fastforward::{history_hash, run};
use sim::season::{open_next_season, roll_season, roll_week};
use sim::{seed_game, DayRecord, Game};

/// Helper: set up a game with one week of journal on Greybank.
fn traded_game() -> Game {
    let mut game = seed_game(7);
    game.port.stocks[Zone::Greybank.idx()] = 2_500;
    for day in 0..7 {
        let mut record = DayRecord::new(day);
        record.trips = [2, 8, 2];
        record.crates = [20, 80, 16];
        record.captain_crates[ActorId::Hale.idx()] = 20;
        record.captain_crates[ActorId::Brandt.idx()] = 80;
        record.captain_crates[ActorId::Okoro.idx()] = 16;
        record.fished_zone[ActorId::Brandt.idx()] = Some(Zone::Greybank);
        record.lot_price_sum = 116 * 400;
        record.lot_crates = 116;
        game.history.push(record);
    }
    game.port.day = 7;
    game
}

/// (a) A voted fallow closes the zone for N weeks and regrowth continues.
#[test]
fn a_voted_fallow_closes_zone_and_regrowth_continues() {
    let mut game = traded_game();
    game.fund.balance = 500_000;
    // Vote a collective fallow on Greybank for 2 weeks
    let motion = Proposal {
        quota_per_licence: 70,
        close_zone: Some(Zone::Greybank),
        close_weeks: Some(2),
        ban_small_mesh: false,
        indemnity_per_licence_week: 0,
        funding: None,
        levy_per_crate: None,
    };
    game.propose(motion);
    let report = roll_season(&mut game);
    assert!(report.tally.passed, "motion carries");
    assert!(game.closed[Zone::Greybank.idx()], "Greybank is shut");
    assert_eq!(game.fallow_left(Zone::Greybank), 2, "2 weeks of fallow");

    // Stock before daily regrowth
    let stock_before = game.port.stocks[Zone::Greybank.idx()];
    // Boats cannot sail to Greybank: assign is rejected
    assert!(game.assign_boat(ActorId::You, 0, Some(Zone::Greybank), rules::state::Mesh::Large).is_err());

    // Run one day: regrowth occurs on Greybank without fishing pressure
    let day_report = run_day(&mut game);
    let stock_after = game.port.stocks[Zone::Greybank.idx()];
    assert!(stock_after > stock_before, "regrowth continues while closed");
    assert!(day_report.lines.iter().any(|l| l.contains("Greybank regrows")));

    // After 1 Monday roll, 1 week remains
    let mut closures = Vec::new();
    let lines = roll_week(&mut game, &mut closures);
    assert!(game.closed[Zone::Greybank.idx()]);
    assert_eq!(game.fallow_left(Zone::Greybank), 1);
    assert!(lines.iter().any(|l| l.contains("1 week(s) of fallow left")));

    // After 2nd Monday roll, Greybank opens again
    let lines = roll_week(&mut game, &mut closures);
    assert!(!game.closed[Zone::Greybank.idx()], "Greybank reopened");
    assert_eq!(game.fallow_left(Zone::Greybank), 0);
    assert!(lines.iter().any(|l| l.contains("opens again")));
}

/// (b) The fund compensates penalized captains and total gold is conserved.
#[test]
fn collective_fallow_indemnifies_and_conserves_gold() {
    let mut game = traded_game();
    game.fund.balance = 1_000_000;
    let gold_before = game.gold_total();
    let brandt_gold_before = game.port.gold[ActorId::Brandt.idx()];

    let motion = Proposal {
        quota_per_licence: 70,
        close_zone: Some(Zone::Greybank),
        close_weeks: Some(3),
        ban_small_mesh: false,
        indemnity_per_licence_week: 0,
        funding: None,
        levy_per_crate: None,
    };
    game.propose(motion);
    let report = roll_season(&mut game);
    assert!(report.tally.passed);

    // Brandt (who fished Greybank) was compensated out of the fund
    assert!(game.port.gold[ActorId::Brandt.idx()] > brandt_gold_before);
    assert!(game.fallow_indemnities_paid > 0);
    assert_eq!(game.gold_total(), gold_before, "gold is strictly conserved");
}

/// (c) Exactly one claim per season maximum.
#[test]
fn one_claim_per_season_maximum() {
    let mut game = traded_game();
    game.fund.balance = 500_000;

    // First claim of the season succeeds
    let first = game.file_claim(ActorId::Brandt, 5_000);
    assert!(first.is_ok(), "first claim admitted");
    assert_eq!(game.claims_this_season, 1);

    // Second claim in the same season is refused at the boundary
    let second = game.file_claim(ActorId::Brandt, 5_000);
    assert!(second.is_err(), "second claim refused");
    assert_eq!(second.unwrap_err(), "one claim per season, no more");

    // Also refused for the player
    let player_claim = game.file_claim(ActorId::You, 10_000);
    assert!(player_claim.is_err(), "player cannot claim after quota spent");

    // But next season, the counter resets
    game.over = true;
    let next_s = open_next_season(&mut game).unwrap();
    assert!(next_s >= 1);
    assert_eq!(game.claims_this_season, 0, "counter resets with new season");
    let next_claim = game.file_claim(ActorId::Brandt, 5_000);
    assert!(next_claim.is_ok(), "new season admits a new claim");
}

/// (d) A won claim is paid by the fund; a lost claim costs credibility.
#[test]
fn won_claim_paid_and_lost_claim_costs_credibility() {
    let mut game = traded_game();
    game.fund.balance = 1_000_000;
    let gold_before = game.gold_total();

    // 1. A claim with proven loss (quota reduced to 50 without indemnity)
    game.config.quota_per_licence = 50;
    let brandt_gold = game.port.gold[ActorId::Brandt.idx()];
    let won = game.file_claim(ActorId::Brandt, 2_000).expect("claim heard");
    assert_eq!(won.outcome, ClaimOutcome::Upheld);
    assert_eq!(won.paid, 2_000);
    assert_eq!(game.port.gold[ActorId::Brandt.idx()], brandt_gold + 2_000);
    assert_eq!(game.gold_total(), gold_before, "gold conserved across won claim");
    assert_eq!(won.credibility_delta, 0, "no penalty for upheld claim");

    // 2. In a fresh season, an abusive claim (> 2x proven loss) is dismissed and costs credibility
    game.over = true;
    open_next_season(&mut game).unwrap();
    let initial_cred = game.credibility;
    let lost = game.file_claim(ActorId::You, 500_000).expect("claim heard");
    assert_eq!(lost.outcome, ClaimOutcome::Dismissed);
    assert_eq!(lost.paid, 0);
    assert_eq!(lost.credibility_delta, -CLAIM_LOST_CREDIBILITY_PENALTY);
    assert_eq!(game.credibility, initial_cred - CLAIM_LOST_CREDIBILITY_PENALTY);
}

/// A voluntary fallow (barreau 4) is not a voted rule and opens no claim.
#[test]
fn voluntary_fallow_opens_no_claim_against_fund() {
    let mut game = traded_game();
    game.sea_debt = 5_000;
    game.pay_in_fallow(Zone::Greybank, 2).expect("fallow");
    assert!(game.closed[Zone::Greybank.idx()]);
    assert_eq!(game.voted_closure, None, "voluntary fallow is not a voted rule");

    // Brandt cannot claim against the fund for a voluntary fallow
    let claim = game.file_claim(ActorId::Brandt, 10_000).expect("claim heard");
    assert_eq!(claim.outcome, ClaimOutcome::Dismissed, "no claim without a voted rule");
    assert_eq!(claim.paid, 0);
}

/// (e) Credibility changes the admission or voting of future motions.
#[test]
fn credibility_blocks_admission_when_below_floor() {
    let mut game = traded_game();
    game.fund.balance = 10_000_000;

    // Normal credibility: motion admitted
    let motion = Proposal {
        quota_per_licence: 50,
        close_zone: None,
        close_weeks: None,
        ban_small_mesh: false,
        indemnity_per_licence_week: 100,
        funding: Some(Funding::Fund),
        levy_per_crate: None,
    };
    assert!(sim::govern::admission(&game, &motion).is_ok());

    // When credibility drops below the floor (e.g. repeated dismissed claims)
    game.credibility = PROPOSER_CREDIBILITY_FLOOR - 1;
    let admitted = sim::govern::admission(&game, &motion);
    assert!(admitted.is_err(), "motion refused due to lack of credibility");
    assert!(admitted.unwrap_err().contains("lost credibility"));

    // Rolling the season with that motion rejects it as irreceivable
    game.propose(motion);
    let report = roll_season(&mut game);
    assert!(!report.tabled, "motion with destroyed credibility is not tabled");
    assert!(report.lines[0].contains("not tabled"));
}

/// (f) Determinism holds across seasons and fastforward runs.
#[test]
fn determinism_holds_with_barreau_5() {
    let mut game1 = seed_game(42);
    let mut game2 = seed_game(42);

    let res1 = run(&mut game1, 28);
    let res2 = run(&mut game2, 28);

    assert_eq!(res1.days_run, 28);
    assert_eq!(res2.days_run, 28);
    assert_eq!(history_hash(&res1.history), history_hash(&res2.history));
    assert_eq!(res1.events.len(), res2.events.len());
    assert_eq!(game1.port.stocks, game2.port.stocks);
    assert_eq!(game1.gold_total(), game2.gold_total());
}
