//! Relay hand trades: names, rule strings, licences, notes and the lease desk.

use rules::council::Funding;
use rules::state::{ActorId, Zone};
use sim::relay::{parse_actor_name, parse_zone_name};
use sim::season::roll_week;
use sim::{seed_game, Game};


#[test]
fn relay_names_round_trip() {
    assert_eq!(parse_actor_name("The Gull"), Some(ActorId::Gull));
    assert_eq!(parse_actor_name("bank"), Some(ActorId::Bank));
    assert_eq!(parse_zone_name("the deeps"), Some(Zone::Deeps));
    assert_eq!(parse_zone_name("greybank"), Some(Zone::Greybank));
    assert_eq!(parse_actor_name("santa"), None);
    assert_eq!(parse_zone_name("atlantis"), None);
}

#[test]
fn rule_strings_parse_into_motions() {
    let game = seed_game(7);
    let motion = game.proposed_motion("quota50", 0).expect("quota");
    assert_eq!(motion.quota_per_licence, 50);
    assert_eq!(motion.close_zone, None);
    assert!(!motion.ban_small_mesh);
    let full = game.proposed_motion("quota50,close:greybank,ban-mesh", 10).expect("full");
    assert_eq!(full.close_zone, Some(Zone::Greybank));
    assert!(full.ban_small_mesh);
    assert_eq!(full.indemnity_per_licence_week, 1000);
    assert!(game.proposed_motion("quota0", 0).is_err());
    assert!(game.proposed_motion("close:nowhere", 0).is_err());
    assert!(game.proposed_motion("freefish", 0).is_err());
}

#[test]
fn hand_licence_trades_conserve_gold_and_licences() {
    let mut game = seed_game(7);
    game.port.gold[ActorId::You.idx()] += 100_000;
    let total = game.gold_total();
    let line = game.trade_licence(ActorId::Okoro, ActorId::You).expect("trade");
    assert!(line.contains("Okoro sells a licence to You"));
    assert_eq!(game.port.licences[ActorId::You.idx()], 5);
    assert_eq!(game.port.total_licences(), 20);
    assert_eq!(game.gold_total(), total);
    assert!(game.trade_licence(ActorId::Bank, ActorId::You).is_err());
    game.pool_licence(ActorId::You, false).expect("sell to pool");
    assert_eq!(game.gold_total(), total);
    assert_eq!(game.port.total_licences(), 20);
}

#[test]
fn seize_needs_a_held_note_in_default() {
    let mut game = seed_game(7);
    assert!(game.seize_note(ActorId::You, 100).is_err());
    game.loans[0].holder = ActorId::You;
    assert!(game.seize_note(ActorId::You, 100).is_err());
    game.loans[0].missed = 1;
    let line = game.seize_note(ActorId::You, 100).expect("seize");
    assert!(line.contains("seized"));
    assert!(game.loans.is_empty());
}

#[test]
fn a_motion_carries_its_payer_in_the_rule_string() {
    let game = seed_game(7);
    let funded = game.proposed_motion("quota50,pay:fund", 4).expect("fund");
    assert_eq!(funded.funding(), Some(Funding::Fund));
    assert_eq!(funded.indemnity_per_licence_week, 400);
    let levied = game.proposed_motion("quota50,fund:levies", 4).expect("levies");
    assert_eq!(levied.funding(), Some(Funding::Levies));
    let free = game.proposed_motion("quota50", 0).expect("nothing promised");
    assert_eq!(free.funding(), None);
    assert!(game.proposed_motion("quota50,pay:sea", 0).is_err());
}

#[test]
fn player_ballot_stands_at_the_council() {
    let mut game = seed_game(7);
    game.cast_vote(false);
    assert_eq!(game.player_vote, Some(false));
}
/// Purse-heavy harbour: no NPC trade fires, so only rent moves a purse.
fn rich_game() -> Game {
    let mut game = seed_game(7);
    game.port.gold = [1_000_000; 10];
    game
}

#[test]
fn leasing_moves_the_quota_not_the_property() {
    let mut game = rich_game();
    game.lease(ActorId::Hale, ActorId::You, 2).expect("lease");
    assert_eq!(game.owned_licences(ActorId::Hale), 4, "Hale still owns 4");
    assert_eq!(game.owned_licences(ActorId::You), 4, "You still owns 4");
    assert_eq!(game.leases.len(), 1, "one lease, one licence");
    assert_eq!(game.quota_crates(ActorId::You), 5 * 70, "You fishes 5");
    assert_eq!(game.quota_crates(ActorId::Hale), 3 * 70, "Hale fishes 3");
    assert_eq!(game.port.total_licences(), 20);
    assert_eq!(game.leases[0].weekly_rent, 1_000, "5% of 200 gold");
    assert_eq!(game.leases[0].weeks_left, 2);
}

#[test]
fn the_rent_is_paid_on_monday_and_the_lessor_purse_rises() {
    let mut game = rich_game();
    game.lease(ActorId::Hale, ActorId::You, 1).expect("lease");
    let rent = game.leases[0].weekly_rent;
    let before = game.port.gold[ActorId::Hale.idx()];
    let mut closures = Vec::new();
    let lines = roll_week(&mut game, &mut closures);
    assert_eq!(game.port.gold[ActorId::Hale.idx()], before + rent as i64);
    assert!(lines.iter().any(|line| line.contains("pays") && line.contains("rent")));
    assert!(game.leases.is_empty(), "a one-week lease closes after its rent");
    assert_eq!((game.quota_crates(ActorId::You), game.port.total_licences()), (4 * 70, 20));
}

#[test]
fn a_lessee_without_gold_loses_the_lease_and_the_licence() {
    let mut game = rich_game();
    game.lease(ActorId::Hale, ActorId::You, 3).expect("lease");
    game.port.gold[ActorId::You.idx()] = 500;
    let mut closures = Vec::new();
    let lines = roll_week(&mut game, &mut closures);
    assert!(game.leases.is_empty(), "the lease fell");
    assert!(lines.iter().any(|line| line.contains("cannot pay")));
    assert_eq!(game.quota_crates(ActorId::You), 4 * 70);
    assert_eq!(game.owned_licences(ActorId::Hale), 4);
    assert_eq!(game.port.total_licences(), 20);
}

#[test]
fn a_licensed_licence_cannot_be_sold() {
    let mut game = rich_game();
    for _ in 0..4 {
        game.lease(ActorId::Hale, ActorId::You, 2).expect("lease");
    }
    assert_eq!(game.owned_licences(ActorId::Hale), 4);
    let err = game.trade_licence(ActorId::Hale, ActorId::You).unwrap_err();
    assert!(err.contains("lease"), "refused: {err}");
    let pooled = game.pool_licence(ActorId::Hale, false).unwrap_err();
    assert!(pooled.contains("lease"), "refused: {pooled}");
}

#[test]
fn ending_a_lease_early_returns_licence_and_quota() {
    let mut game = rich_game();
    game.lease(ActorId::Hale, ActorId::You, 4).expect("lease");
    let gold = game.port.gold[ActorId::You.idx()];
    let line = game.unlease(ActorId::You, ActorId::Hale).expect("unlease");
    assert!(line.contains("ended early"));
    assert!(game.leases.is_empty());
    assert_eq!(game.quota_crates(ActorId::You), 4 * 70);
    assert_eq!(game.quota_crates(ActorId::Hale), 4 * 70);
    assert_eq!(game.port.gold[ActorId::You.idx()], gold, "no penalty");
    assert!(game.unlease(ActorId::You, ActorId::Hale).is_err());
    assert!(game.unlease(ActorId::Okoro, ActorId::Hale).is_err());
}

#[test]
fn the_cap_counts_owned_licences_not_leased_ones() {
    let mut game = rich_game();
    assert_eq!(game.owned_licences(ActorId::Brandt), 8, "at the ceiling");
    game.lease(ActorId::Hale, ActorId::Brandt, 2).expect("lease in");
    assert_eq!(game.owned_licences(ActorId::Brandt), 8, "still owns 8");
    assert_eq!(game.quota_crates(ActorId::Brandt), 9 * 70, "fishes 9");
    let err = game.trade_licence(ActorId::You, ActorId::Brandt).unwrap_err();
    assert!(err.contains("ceiling"), "refused: {err}");
    assert!(game.trade_licence(ActorId::Okoro, ActorId::You).is_ok());
}
