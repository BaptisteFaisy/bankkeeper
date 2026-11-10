//! The port's memory and the player's institution (chronicle + charter).
//!
//! A closed season writes one public line in the chronicle; the charters a
//! campaign writes at its end rule the campaigns after it, never its own.

use rules::state::{ActorId, Mesh, Zone};
use rules::trips::quota_left;
use sim::charter::{levy_idle_tax, Charter, IDLE_TAX_BPS};
use sim::cycle::run_day;
use sim::season::{open_next_season, roll_week};
use sim::{seed_game, seed_game_with};

/// A campaign whose seasons last a fortnight (the demo length).
fn fortnight(seed: u64) -> sim::Game {
    let mut game = seed_game(seed);
    game.config.weeks_per_season = 2;
    game
}

/// Play one whole season of fourteen days.
fn play_season(game: &mut sim::Game) {
    for _ in 0..14 {
        run_day(game);
    }
}

#[test]
fn one_chronicle_entry_per_closed_season_in_order() {
    let mut game = fortnight(7);
    let mut worths = Vec::new();
    for _ in 0..3 {
        play_season(&mut game);
        assert_eq!(game.chronicle.len(), worths.len() + 1, "one entry per close");
        worths.push(game.bilan.clone().expect("bilan").net_worth);
        let _ = open_next_season(&mut game);
    }
    let seasons: Vec<u64> = game.chronicle.iter().map(|entry| entry.season).collect();
    assert_eq!(seasons, vec![1, 2, 3], "the chronicle is in season order");
    for (index, entry) in game.chronicle.iter().enumerate() {
        assert_eq!(entry.seed, 7);
        assert_eq!(entry.net_worth, worths[index]);
        assert_eq!(entry.stocks.len(), 3);
    }
    assert_eq!(game.chronicle.len(), 3);
}

#[test]
fn the_chronicle_survives_next_season_and_a_save() {
    use sim::season::open_next_season;
    let mut game = fortnight(7);
    play_season(&mut game);
    let written = game.chronicle.clone();
    assert_eq!(written.len(), 1);
    open_next_season(&mut game).expect("the campaign goes on");
    assert_eq!(game.chronicle, written, "next-season keeps the chronicle");
    let json = serde_json::to_string(&game).expect("serialize");
    let back: sim::Game = serde_json::from_str(&json).expect("deserialize");
    assert_eq!(back.chronicle, written, "a saved harbour keeps its memory");
    assert_eq!(back.chronicle[0].season, 1);
}

#[test]
fn a_quota_charter_gives_fifty_crates_a_licence() {
    let charter = Charter { quota_per_licence: Some(50), ..Charter::default() };
    let game = seed_game_with(7, Some(charter.clone()));
    assert_eq!(game.config.quota_per_licence, 50);
    assert_eq!(game.charter, Some(charter));
    let held = game.port.licences[ActorId::You.idx()];
    assert_eq!(quota_left(held, 0, &game.config), held * 50);
    // The campaign after the one that wrote it starts under the same rule.
    assert_eq!(game.config.quota_per_licence, 50, "the new campaign works to 50");
}

#[test]
fn a_mesh_charter_bans_the_small_net_from_the_first_day() {
    let game = seed_game_with(7, Some(Charter { ban_small_mesh: true, ..Charter::default() }));
    let mut game = game;
    assert!(game.small_mesh_banned);
    assert!(game.port.boats.iter().all(|boat| boat.mesh == Mesh::Large), "no fine net is rigged");
    let refused = game.assign_boat(ActorId::You, 0, None, Mesh::Small);
    assert!(refused.is_err(), "the small net is refused at the quay: {refused:?}");
    assert!(refused.unwrap_err().contains("banned"));
    game.assign_boat(ActorId::You, 0, Some(Zone::Shallows), Mesh::Large).expect("large net sails");
}

#[test]
fn the_idle_levy_charges_the_purse_and_pools_what_it_cannot_cover() {
    let mut game = seed_game(7);
    game.charter = Some(Charter { idle_licence_tax_bps: Some(IDLE_TAX_BPS), ..Charter::default() });
    game.port.day = 14;
    game.port.licences = [4, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let tax = game.licence_price_now() * IDLE_TAX_BPS / 10_000;
    // Purse empty: the licences go back to the pool instead of the gold.
    game.port.gold[ActorId::You.idx()] = 0;
    let lines = levy_idle_tax(&mut game);
    assert_eq!(game.port.licences[ActorId::You.idx()], 0);
    assert_eq!(game.port.licence_pool, 4);
    assert!(lines.iter().any(|line| line.contains("back to the pool")), "{lines:?}");
    // Purse full: the gold moves to the bank and the licences stay.
    game.port.licence_pool = 0;
    game.port.licences[ActorId::You.idx()] = 4;
    game.port.gold[ActorId::You.idx()] = 1_000_000;
    let bank = game.port.gold[ActorId::Bank.idx()];
    let before = game.port.gold[ActorId::You.idx()];
    levy_idle_tax(&mut game);
    assert_eq!(game.port.licences[ActorId::You.idx()], 4);
    assert_eq!(game.port.gold[ActorId::You.idx()], before - (4 * tax) as i64);
    assert_eq!(game.port.gold[ActorId::Bank.idx()], bank + (4 * tax) as i64);
    assert_eq!(game.port.total_licences(), 4, "licences are never minted, only moved");
}

#[test]
fn the_idle_levy_is_a_monday_line_in_the_week_roll() {
    let mut game = seed_game(7);
    game.charter = Some(Charter { idle_licence_tax_bps: Some(IDLE_TAX_BPS), ..Charter::default() });
    game.port.day = 21;
    game.port.licences = [4, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    game.port.gold[ActorId::You.idx()] = 1_000_000;
    let mut closures = Vec::new();
    let lines = roll_week(&mut game, &mut closures);
    assert!(lines.iter().any(|line| line.contains("idle-licence tax")), "{lines:?}");
    assert_eq!(game.port.licences[ActorId::You.idx()], 4);
}

#[test]
fn a_charter_never_rules_the_campaign_that_wrote_it() {
    let mut game = fortnight(7);
    play_season(&mut game);
    // The player writes the charter at the very end of the campaign.
    game.charter = Some(Charter { quota_per_licence: Some(50), ..Charter::default() });
    open_next_season(&mut game).expect("the campaign goes on");
    assert_eq!(
        game.config.quota_per_licence, 70,
        "the season that follows runs under the old rule; only a new campaign takes the charter"
    );
    assert_eq!(game.charter.as_ref().and_then(|c| c.quota_per_licence), Some(50), "the charter is recorded");
}

#[test]
fn an_old_save_without_a_chronicle_still_loads() {
    let game = seed_game(7);
    let mut raw = serde_json::to_value(&game).expect("serialize");
    let object = raw.as_object_mut().expect("object");
    object.remove("chronicle");
    object.remove("charter");
    let back: sim::Game = serde_json::from_value(raw).expect("old saves still load");
    assert!(back.chronicle.is_empty());
    assert!(back.charter.is_none());
    assert_eq!(back.port.day, 0);
}
