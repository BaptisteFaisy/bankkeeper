//! Shared harness for the audit proofs: a seeded world, a caller switch,
//! panic capture and the two probes the proofs read (logs, sources).

use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, AccountId, NearToken};
use tidewater::Tidewater;

pub struct World {
    pub game: Tidewater,
    pub owner: AccountId,
    pub player: AccountId,
}

pub fn as_caller(caller: &AccountId, yocto: u128) {
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(caller.clone())
        .attached_deposit(NearToken::from_yoctonear(yocto))
        .build());
}

pub fn setup() -> World {
    let owner = accounts(0);
    let player = accounts(1);
    as_caller(&owner, 0);
    let game = Tidewater::new(owner.clone(), player.clone());
    World { game, owner, player }
}

pub fn acct(name: &str) -> AccountId {
    name.parse().expect("valid account id")
}

/// Runs `f`, turning a panic into `Err(message)` so a test can assert on it.
pub fn outcome<T>(f: impl FnOnce() -> T) -> Result<T, String> {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)).map_err(|payload| {
        payload
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| payload.downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "<non-string panic>".to_string())
    })
}

pub fn ok_or_panic<T>(what: &str, r: Result<T, String>) -> T {
    match r {
        Ok(value) => value,
        Err(message) => panic!("{what}: {message}"),
    }
}

pub fn gold(w: &World, owner: &str) -> u128 {
    w.game.get_ledger(owner.to_string(), "0".to_string()).0
}

pub fn licences(w: &World, owner: &str) -> u128 {
    w.game.get_ledger(owner.to_string(), "3".to_string()).0
}

pub fn src(name: &str) -> String {
    let path = format!("{}/src/{}", env!("CARGO_MANIFEST_DIR"), name);
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {path}: {e}"))
}

/// Drives the contract to a day inside the council session (season day >= 21).
pub fn open_council(w: &mut World) {
    for _ in 0..21 {
        as_caller(&w.owner.clone(), 0);
        ok_or_panic("run_day before the council", outcome(|| w.game.run_day()));
    }
}

pub fn last_event() -> String {
    near_sdk::test_utils::get_logs()
        .into_iter()
        .rev()
        .find(|line| line.starts_with("EVENT_JSON:"))
        .expect("the call emitted no EVENT_JSON line")
}
