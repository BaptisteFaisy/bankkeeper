//! D01..D08: the transfer layer, the bank pool, the deed and the council.

use super::harness::*;
use near_sdk::json_types::U128;
use tidewater::{npc_owner, ProposalKind};

// ---------------------------------------------------------------------------
// D01 — NEP-245: mt_transfer / mt_batch_transfer are not #[payable]
// ---------------------------------------------------------------------------

/// The ABI of the shipped wasm has no `payable` modifier anywhere, so the
/// runtime rejects every deposit; `assert_yocto()` can therefore never pass.
/// This test reads the attribute that decides both facts.
/// Names of the entry points that demand 1 yocto without declaring `#[payable]`.
fn unpayable_yocto_methods() -> Vec<String> {
    let source = src("nep245.rs");
    let lines: Vec<&str> = source.lines().collect();
    let mut offenders: Vec<String> = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        if !line.contains("assert_yocto();") {
            continue;
        }
        let mut j = i;
        while j > 0 && !lines[j].contains("fn ") {
            j -= 1;
        }
        let mut k = j;
        let mut payable = false;
        while k > 0 {
            k -= 1;
            let above = lines[k].trim();
            if above.starts_with("#[") {
                payable |= above.starts_with("#[payable]");
            } else {
                break;
            }
        }
        if !payable {
            offenders.push(lines[j].trim().to_string());
        }
    }
    offenders
}

#[test]
#[ignore = "bug: D01 mt_transfer/mt_batch_transfer call assert_yocto() but are not #[payable]"]
fn d01_mt_transfers_that_require_yocto_must_be_payable() {
    let offenders = unpayable_yocto_methods();
    assert!(
        offenders.is_empty(),
        "entry points demand 1 yocto but the wasm wrapper rejects any deposit \
         (\"Method ... doesn't accept deposit\"), so they can never be called \
         on chain: {offenders:?}"
    );
}

// ---------------------------------------------------------------------------
// D02 — economy: the bank is seeded with zero licences
// ---------------------------------------------------------------------------

#[test]
#[ignore = "bug: D02 new() leaves 0 of the 20 licences with npc:bank, buy_licence is dead code"]
fn d02_bank_holds_no_licence_so_buy_licence_can_never_sell() {
    let mut w = setup();
    let player = w.player.clone();
    let bank = npc_owner("bank");
    let with_captains: u128 = [
        player.to_string(),
        npc_owner("marta"),
        npc_owner("brandt"),
        npc_owner("okoro"),
    ]
    .iter()
    .map(|owner| licences(&w, owner))
    .sum();
    as_caller(&player, 0);
    let sold = outcome(|| w.game.buy_licence());
    assert!(
        sold.is_ok(),
        "buy_licence cannot sell: npc:bank holds {} of the {} licences ({} are with the \
         four captains) and the call returns {}",
        licences(&w, &bank),
        tidewater::LICENCE_SUPPLY,
        with_captains,
        match &sold {
            Err(message) => message.as_str(),
            Ok(_) => "Ok",
        }
    );
}

// ---------------------------------------------------------------------------
// D03 — NEP-245: duplicate token ids in a batch mint balances
// ---------------------------------------------------------------------------

#[test]
fn d03_duplicate_legs_in_a_batch_mint_tokens() {
    let mut w = setup();
    let player = w.player.clone();
    let bob = acct("bob.testnet");
    as_caller(&player, 1);
    let before = licences(&w, &player.to_string());
    // Two legs of one token draw on one purse: {before} + {before} out of a
    // {before}-licence balance must be refused, however valid each leg looks
    // when checked alone against the same starting balance.
    let sent = outcome(|| {
        w.game.mt_batch_transfer(
            bob.clone(),
            vec!["3".to_string(), "3".to_string()],
            vec![U128(before), U128(before)],
            None,
            None,
        )
    });
    let held: u128 = [player.to_string(), bob.to_string(), npc_owner("marta"),
        npc_owner("brandt"), npc_owner("okoro"), npc_owner("bank")]
        .iter()
        .map(|owner| licences(&w, owner))
        .sum();
    let supply = w.game.mt_supply("3".to_string()).map(|s| s.0).unwrap_or(0);
    assert!(
        sent.is_err() && held == supply && licences(&w, &player.to_string()) == before,
        "the two legs ({before} + {before} licences out of a {before}-licence balance) were \
         both accepted: the sender is left with {} and the receiver holds {}, so holders \
         show {held} against a supply of {supply} — {} licences were minted",
        licences(&w, &player.to_string()),
        licences(&w, &bob.to_string()),
        held.saturating_sub(supply)
    );
}

// ---------------------------------------------------------------------------
// D04 — NEP-245: the batch event carries no amounts
// ---------------------------------------------------------------------------

#[test]
fn d04_batch_transfer_event_has_no_amounts_array() {
    let mut w = setup();
    let player = w.player.clone();
    as_caller(&player, 1);
    w.game.mt_batch_transfer(
        acct("bob.testnet"),
        vec!["3".to_string(), "10".to_string()],
        vec![U128(1), U128(1)],
        None,
        None,
    );
    let event = last_event();
    let body = event.trim_start_matches("EVENT_JSON:");
    let parsed: near_sdk::serde_json::Value =
        near_sdk::serde_json::from_str(body).expect("the event is valid JSON");
    let data = parsed["data"].as_array().expect("data is an array");
    for item in data {
        let ids = item["token_ids"].as_array().map(|a| a.len()).unwrap_or(0);
        let amounts = item["amounts"].as_array().map(|a| a.len()).unwrap_or(0);
        assert_eq!(
            ids, amounts, "NEP-245 batch events index token_ids and amounts in parallel, \
             got {ids} ids and {amounts} amounts: {event}"
        );
    }
}

// ---------------------------------------------------------------------------
// D05 — NEP-245: the event log is not escaped (memo injection)
// ---------------------------------------------------------------------------

#[test]
fn d05_memo_with_a_quote_breaks_the_event_json() {
    let mut w = setup();
    let player = w.player.clone();
    as_caller(&player, 1);
    w.game.mt_transfer(
        acct("bob.testnet"),
        "3".to_string(),
        U128(1),
        None,
        Some("say \"hi\"".to_string()),
    );
    let event = last_event();
    let parsed = near_sdk::serde_json::from_str::<near_sdk::serde_json::Value>(
        event.trim_start_matches("EVENT_JSON:"),
    );
    assert!(
        parsed.is_ok(),
        "NEP-297 requires one well-formed JSON event per log line, the memo is \
         interpolated unescaped: {event}"
    );
}

// ---------------------------------------------------------------------------
// D06 — ownership: a boat sale does not move the boat
// ---------------------------------------------------------------------------

#[test]
fn d06_buying_a_boat_deed_does_not_give_the_boat() {
    let mut w = setup();
    let player = w.player.clone();
    let bob = acct("bob.testnet");
    as_caller(&player, 1);
    w.game.mt_transfer(bob.clone(), "10".to_string(), U128(1), None, None);
    as_caller(&bob, 0);
    let bought = outcome(|| w.game.land_lot("10".to_string()));
    as_caller(&player, 0);
    let sold = outcome(|| w.game.land_lot("10".to_string()));
    let mut violations = Vec::new();
    if let Err(message) = &bought {
        violations.push(format!(
            "the deed holder cannot sail the boat it bought: {message}"
        ));
    }
    if sold.is_ok() {
        violations.push(
            "the former owner still lands the boat it sold and keeps the proceeds".to_string(),
        );
    }
    assert!(
        violations.is_empty(),
        "a boat deed is an inert token: {violations:?}"
    );
}

// ---------------------------------------------------------------------------
// D07 — council: no-voters are paid the indemnity
// ---------------------------------------------------------------------------

#[test]
fn d07_captains_who_vote_no_are_paid_the_indemnity() {
    let mut w = setup();
    open_council(&mut w);
    let player = w.player.clone();
    let owner = w.owner.clone();
    as_caller(&player, 0);
    let id = w
        .game
        .propose_rule(ProposalKind::QuotaPerLicence(50), U128(50_000));
    // The author votes yes with 4 licences, the two solvent NPCs vote no.
    as_caller(&player, 0);
    ok_or_panic("the author's yes vote", outcome(|| w.game.vote(id, true)));
    as_caller(&owner, 0);
    w.game.cast_npc_votes(id);
    let proposal = w.game.get_proposal(id);
    assert!(
        proposal.yes_weight > 0 && proposal.no_weight > proposal.yes_weight,
        "precondition: the motion must fail, got yes {} / no {}",
        proposal.yes_weight,
        proposal.no_weight
    );
    let marta = npc_owner("marta");
    let before = gold(&w, &marta);
    as_caller(&owner, 0);
    let resolved = w.game.resolve_council(id);
    let after = gold(&w, &marta);
    assert!(
        after <= before,
        "the motion failed (yes {} / no {}) yet a captain who voted no was paid \
         {} milli-gold of the author's escrow",
        resolved.yes_weight,
        resolved.no_weight,
        after - before
    );
}

// ---------------------------------------------------------------------------
// D08 — loans: the note token and `lender` diverge
// ---------------------------------------------------------------------------

#[test]
fn d08_the_loan_note_holder_cannot_act_as_lender() {
    let mut w = setup();
    let player = w.player.clone();
    let bob = acct("bob.testnet");
    as_caller(&player, 0);
    ok_or_panic("buy the bank's note", outcome(|| {
        w.game.buy_loan("100".to_string())
    }));
    as_caller(&player, 1);
    w.game.mt_transfer(bob.clone(), "100".to_string(), U128(1), None, None);
    as_caller(&bob, 0);
    let forbear = outcome(|| w.game.forbear_loan("100".to_string()));
    as_caller(&bob, 0);
    let seize = outcome(|| w.game.seize_boat("100".to_string()));
    assert!(
        forbear.is_ok() && seize.is_ok(),
        "the holder of note 100 owns nothing: forbear -> {:?}, seize -> {:?} \
         (the old lender keeps the rights and the note is a souvenir)",
        forbear.err(),
        seize.err()
    );
}

