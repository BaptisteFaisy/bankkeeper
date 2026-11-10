//! Audit of the `tidewater` contract — executable proofs, one test per defect.
//!
//! Every `dNN_*` test FAILS while the defect it names is present and PASSES
//! once the defect is fixed. They are `#[ignore]`d so that
//! `cargo test -p tidewater` stays green for CI. Run the proofs with:
//!
//! ```text
//! cargo test -p tidewater --test audit -- --ignored --nocapture
//! ```
//!
//! The `sane_*` tests are regression guards for invariants that DO hold today
//! (gold conservation, guard codes, atomic landings); they run in CI.
//!
//! Cross-references and severities: `docs/AUDIT-CONTRACT.md`.

use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, AccountId, NearToken};
use near_sdk::json_types::U128;
use tidewater::{npc_owner, ProposalKind, Tidewater};

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

struct World {
    game: Tidewater,
    owner: AccountId,
    player: AccountId,
}

fn as_caller(caller: &AccountId, yocto: u128) {
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(caller.clone())
        .attached_deposit(NearToken::from_yoctonear(yocto))
        .build());
}

fn setup() -> World {
    let owner = accounts(0);
    let player = accounts(1);
    as_caller(&owner, 0);
    let game = Tidewater::new(owner.clone(), player.clone());
    World { game, owner, player }
}

fn acct(name: &str) -> AccountId {
    name.parse().expect("valid account id")
}

/// Runs `f`, turning a panic into `Err(message)` so a test can assert on it.
fn outcome<T>(f: impl FnOnce() -> T) -> Result<T, String> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)).map_err(|payload| {
        payload
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| payload.downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "<non-string panic>".to_string())
    })
}

fn ok_or_panic<T>(what: &str, r: Result<T, String>) -> T {
    match r {
        Ok(value) => value,
        Err(message) => panic!("{what}: {message}"),
    }
}

fn gold(w: &World, owner: &str) -> u128 {
    w.game.get_ledger(owner.to_string(), "0".to_string()).0
}

fn licences(w: &World, owner: &str) -> u128 {
    w.game.get_ledger(owner.to_string(), "3".to_string()).0
}

fn src(name: &str) -> String {
    let path = format!("{}/src/{}", env!("CARGO_MANIFEST_DIR"), name);
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {path}: {e}"))
}

/// Drives the contract to a day inside the council session (season day >= 21).
fn open_council(w: &mut World) {
    for _ in 0..21 {
        as_caller(&w.owner.clone(), 0);
        ok_or_panic("run_day before the council", outcome(|| w.game.run_day()));
    }
}

fn last_event() -> String {
    near_sdk::test_utils::get_logs()
        .into_iter()
        .rev()
        .find(|line| line.starts_with("EVENT_JSON:"))
        .expect("the call emitted no EVENT_JSON line")
}

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
#[ignore = "bug: D06 rights follow boats.captain, not the deed token balance"]
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
#[ignore = "bug: D07 pay_indemnities pays every voter, including the ones who voted no"]
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
#[ignore = "bug: D08 transferring note token 100 does not move the lender's rights"]
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

// ---------------------------------------------------------------------------
// D09 — economy: the licence cap is declared and never enforced
// ---------------------------------------------------------------------------

#[test]
#[ignore = "bug: D09 LICENCE_CAP_PER_CAPTAIN is declared in lib.rs:57 and used nowhere"]
fn d09_the_licence_cap_is_dead_code() {
    let mut uses = Vec::new();
    for file in [
        "lib.rs",
        "actions.rs",
        "loans.rs",
        "council.rs",
        "bailout.rs",
        "nep245.rs",
        "views.rs",
        "game.rs",
    ] {
        let hits = src(file).matches("LICENCE_CAP_PER_CAPTAIN").count();
        if hits > 0 {
            uses.push(format!("{file}: {hits}"));
        }
    }
    assert!(
        uses.len() > 1,
        "the cap ({} licences per captain) is defined but never read: {uses:?}, so \
         one account can buy the whole council",
        tidewater::LICENCE_CAP_PER_CAPTAIN
    );
}

// ---------------------------------------------------------------------------
// D10 — storage: state grows for free
// ---------------------------------------------------------------------------

#[test]
#[ignore = "bug: D10 no storage deposit (no NEP-145, no assert_one_yocto) on propose_rule"]
fn d10_zero_indemnity_proposals_grow_state_for_free() {
    let mut w = setup();
    open_council(&mut w);
    let player = w.player.clone();
    let mut accepted = 0;
    let mut last_error = String::new();
    for quota in 0..50u64 {
        as_caller(&player, 0);
        match outcome(|| w.game.propose_rule(ProposalKind::QuotaPerLicence(quota), U128(0))) {
            Ok(_) => accepted += 1,
            Err(message) => last_error = message,
        }
    }
    assert_eq!(
        accepted, 0,
        "{accepted} proposals were written to storage with 0 yocto attached and 0 \
         indemnity escrowed (last refusal: {last_error:?}): the contract charges no \
         storage deposit, any account can inflate its state for free"
    );
}

#[test]
#[ignore = "bug: D11 a zero-amount transfer creates an empty ledger slot for free"]
fn d11_zero_amount_transfer_is_accepted() {
    let mut w = setup();
    let player = w.player.clone();
    as_caller(&player, 1);
    let sent = outcome(|| {
        w.game.mt_transfer(acct("bob.testnet"), "3".to_string(), U128(0), None, None)
    });
    assert!(
        sent.is_err(),
        "a 0-licence transfer was accepted: it writes a (owner, token) entry for the \
         receiver and emits an event, for 1 yocto, with no limit on the number of \
         receivers"
    );
}

// ---------------------------------------------------------------------------
// D12 — state: the council resolves outside its session
// ---------------------------------------------------------------------------

#[test]
#[ignore = "bug: D12 resolve_council does not check assert_council_open"]
fn d12_a_proposal_can_be_resolved_after_the_session_closed() {
    let mut w = setup();
    open_council(&mut w);
    let player = w.player.clone();
    let owner = w.owner.clone();
    as_caller(&player, 0);
    let id = w
        .game
        .propose_rule(ProposalKind::QuotaPerLicence(10), U128(0));
    for _ in 0..8 {
        as_caller(&owner, 0);
        ok_or_panic("run_day", outcome(|| w.game.run_day()));
    }
    let day = w.game.get_day();
    assert!(
        !day.council_open,
        "precondition: the session is closed (day {}, season day {})",
        day.day, day.season_day
    );
    as_caller(&owner, 0);
    let resolved = outcome(|| w.game.resolve_council(id));
    assert!(
        resolved.is_err(),
        "a proposal from the closed session was resolved and applied on season day {}",
        day.season_day
    );
}

// ---------------------------------------------------------------------------
// D13 — council: one licence, many votes
// ---------------------------------------------------------------------------

#[test]
#[ignore = "bug: D13 vote weight is read at vote time, so a licence votes again after each transfer"]
fn d13_one_licence_can_vote_several_times() {
    let mut w = setup();
    open_council(&mut w);
    let id = {
        as_caller(&w.player.clone(), 0);
        w.game
            .propose_rule(ProposalKind::QuotaPerLicence(70), U128(100_000))
    };
    let mut holder = w.player.clone();
    for name in ["bob", "carol", "dave", "erin", "frank"] {
        as_caller(&holder, 0);
        ok_or_panic("vote", outcome(|| w.game.vote(id, true)));
        let next = acct(&format!("{name}.testnet"));
        as_caller(&holder, 1);
        w.game
            .mt_transfer(next.clone(), "3".to_string(), U128(4), None, None);
        holder = next;
    }
    as_caller(&holder, 0);
    ok_or_panic("the last vote", outcome(|| w.game.vote(id, true)));
    let proposal = w.game.get_proposal(id);
    let tally = proposal.yes_weight + proposal.no_weight;
    assert!(
        tally <= tidewater::LICENCE_SUPPLY,
        "the same 4 licences voted 6 times: the tally is {tally} for a supply of {} \
         ({} yes / {} no)",
        tidewater::LICENCE_SUPPLY,
        proposal.yes_weight,
        proposal.no_weight
    );
}

// ---------------------------------------------------------------------------
// D14 — panics: the E_* convention is not systematic
// ---------------------------------------------------------------------------

#[test]
#[ignore = "bug: D14 two refusals panic with the bare string \"owner only\", not an E_ code"]
fn d14_every_refusal_carries_an_e_code() {
    let mut offenders = Vec::new();
    for file in [
        "lib.rs",
        "actions.rs",
        "loans.rs",
        "council.rs",
        "bailout.rs",
        "nep245.rs",
        "views.rs",
        "game.rs",
    ] {
        let source = src(file);
        for (number, line) in source.lines().enumerate() {
            if line.contains("\"owner only\"") {
                offenders.push(format!("{file}:{}", number + 1));
            }
        }
    }
    assert!(
        offenders.is_empty(),
        "a refusal must be greppable by its E_ code, these are not: {offenders:?}"
    );
}

// ---------------------------------------------------------------------------
// D15 — rules: the small mesh is bent on at sea
// ---------------------------------------------------------------------------

/// TW-C2-02, quoted by docs/API.md: "le filet ne se change qu'a quai".
#[test]
#[ignore = "bug: D15 assign_boat changes the mesh at sea, TW-C2-02 is not enforced"]
fn d15_small_mesh_is_bent_on_at_sea() {
    let mut w = setup();
    let player = w.player.clone();
    // Boat 10 sails zone 1 with a normal net.
    as_caller(&player, 0);
    ok_or_panic("moor the boat", outcome(|| {
        w.game.assign_boat("10".to_string(), None, false)
    }));
    as_caller(&player, 0);
    ok_or_panic("set sail", outcome(|| {
        w.game.assign_boat("10".to_string(), Some(1), false)
    }));
    as_caller(&player, 0);
    let changed = outcome(|| w.game.assign_boat("10".to_string(), Some(1), true));
    assert!(
        changed.is_err(),
        "the 40 % small-mesh catch was granted without mooring: the mesh changed at sea \
         (TW-C2-02 bypassed), and assign_boat also ignores the zone change at sea"
    );
}

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
