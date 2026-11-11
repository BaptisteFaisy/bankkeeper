//! D09..D15: the licence cap, storage, session bounds, vote weight, codes.

use super::harness::*;
use near_sdk::json_types::U128;
use tidewater::ProposalKind;

// ---------------------------------------------------------------------------
// D09 — economy: the licence cap is declared and never enforced
// ---------------------------------------------------------------------------

#[test]
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

