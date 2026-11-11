//! Regression guards: the invariants the audit relies on, green today.

use super::harness::*;
use near_sdk::json_types::U128;
use near_sdk::AccountId;
use tidewater::npc_owner;

// ---------------------------------------------------------------------------
// Sane guards (these pass today; they pin the behaviour the audit relies on)
// ---------------------------------------------------------------------------

#[test]
fn sane_gold_supply_equals_the_sum_of_every_ledger() {
    let mut w = setup();
    let player = w.player.clone();
    let owner = w.owner.clone();
    for _ in 0..3 {
        as_caller(&player, 0);
        ok_or_panic("landing", outcome(|| w.game.land_lot("10".to_string())));
    }
    as_caller(&owner, 0);
    ok_or_panic("run_day", outcome(|| w.game.run_day()));
    let owners = [
        player.to_string(),
        npc_owner("marta"),
        npc_owner("brandt"),
        npc_owner("okoro"),
        npc_owner("fishmonger"),
        npc_owner("cannery"),
        npc_owner("gull"),
        npc_owner("bank"),
        npc_owner("chandlery"),
        npc_owner("residents"),
        npc_owner("escrow"),
    ];
    let sum: u128 = owners.iter().map(|owner| gold(&w, owner)).sum();
    let supply = w.game.mt_supply("0".to_string()).map(|s| s.0).unwrap_or(0);
    assert_eq!(sum, supply, "gold is conserved across a landing and a day");
}

/// Runs `f` as `caller` and returns the panic message (or "<no panic>").
fn refusal_of<T>(caller: &AccountId, yocto: u128, f: impl FnOnce() -> T) -> String {
    as_caller(caller, yocto);
    outcome(f).err().unwrap_or_else(|| "<no panic>".to_string())
}

#[test]
fn sane_refusals_carry_their_e_code() {
    let mut w = setup();
    let player = w.player.clone();
    let bob = acct("bob.testnet");
    let mut cases: Vec<(&str, String)> = Vec::new();
    let mut push = |code: &'static str, message: String| cases.push((code, message));
    push("E_INSUFFICIENT", refusal_of(&player, 1, || {
        w.game
            .mt_transfer(bob.clone(), "3".to_string(), U128(99), None, None)
    }));
    push("E_UNKNOWN_TOKEN", refusal_of(&player, 1, || {
        w.game
            .mt_transfer(bob.clone(), "999".to_string(), U128(1), None, None)
    }));
    push("E_SELF_TRANSFER", refusal_of(&player, 1, || {
        w.game
            .mt_transfer(player.clone(), "3".to_string(), U128(1), None, None)
    }));
    push("E_NOT_YOUR_BOAT", refusal_of(&bob, 0, || {
        w.game.assign_boat("10".to_string(), Some(0), false)
    }));
    push("E_UNKNOWN_LOAN", refusal_of(&player, 0, || {
        w.game.forbear_loan("424242".to_string())
    }));
    push("owner only", refusal_of(&player, 0, || w.game.run_day()));
    for (code, message) in cases {
        assert!(
            message.contains(code),
            "a refusal came back as {message:?} instead of a readable {code}"
        );
    }
}

#[test]
fn sane_a_landing_cannot_create_fish_and_stops_at_three_trips() {
    let mut w = setup();
    let player = w.player.clone();
    let before = w.game.get_zone(1).stock;
    as_caller(&player, 0);
    let receipt = ok_or_panic("first landing", outcome(|| w.game.land_lot("10".to_string())));
    let after = w.game.get_zone(1).stock;
    let crates = receipt.crates;
    assert!(
        before - after == crates,
        "the zone lost {} crates but the lot carried {crates}",
        before - after
    );
    for _ in 0..2 {
        as_caller(&player, 0);
        ok_or_panic("landing", outcome(|| w.game.land_lot("10".to_string())));
    }
    as_caller(&player, 0);
    let fourth = outcome(|| w.game.land_lot("10".to_string()));
    let refusal = match &fourth {
        Err(message) => message.clone(),
        Ok(receipt) => format!("the call succeeded with a lot of {} crates", receipt.crates),
    };
    assert!(
        refusal.contains("E_TRIPS_SPENT"),
        "a fourth trip on the same day was not refused with E_TRIPS_SPENT: {refusal}"
    );
}
