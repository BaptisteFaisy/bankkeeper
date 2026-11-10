//! Tidewater engine for the browser.
//!
//! The rules and the sim are pure Rust, so the whole harbour fits in a
//! WebAssembly module: no relay, no server, no network. This crate is a thin
//! adapter that speaks **exactly the JSON the relay serves** (`web/src/api.ts`
//! swaps `fetch` for this and learns nothing else).
//!
//! ABI: no wasm-bindgen. `tw_alloc` hands out a buffer, JS writes the request
//! JSON into it, `tw_call` returns a pointer to the reply and `tw_out_len`
//! its length. Same thread, one call at a time — a game, not a database.

use std::cell::RefCell;

use serde_json::{json, Value};
use sim::{cycle::try_day, fastforward, relay, seed_game, views, Game};

thread_local! {
    static GAME: RefCell<Option<Game>> = RefCell::new(None);
    /// Seed and season length of the harbour in memory, kept for `reset`.
    static SHAPE: RefCell<(u64, u64)> = RefCell::new((7, 2));
}

/// Default harbour: seed 7, a fortnight (the demo length, brief section 13).
const DEFAULT_SEED: u64 = 7;
const DEFAULT_WEEKS: u64 = 2;
/// One trip per boat per day in the browser build: ten boats, ten lots, five
/// minutes at thirty seconds a lot. TW-N-10 says *at most* three trips, so
/// this is inside the rule, and it makes the track's two numbers exact.
const DEMO_TRIPS: u64 = 1;
/// The browser demo runs barreau 2 with the levy on: 0.4 gold a crate, so the
/// port fund fills from the first sale instead of waiting for a council vote.
const DEMO_LEVY: u64 = rules::config::DEMO_LEVY_PER_CRATE;

/// Run `body` against the harbour, creating it on first use.
fn with_game<T>(body: impl FnOnce(&mut Game) -> T) -> T {
    GAME.with(|slot| {
        let mut slot = slot.borrow_mut();
        if slot.is_none() {
            let mut fresh = seed_game(DEFAULT_SEED);
            fresh.config.weeks_per_season = DEFAULT_WEEKS;
            fresh.config.trips_per_boat_day = DEMO_TRIPS;
            fresh.config.levy_per_crate = DEMO_LEVY;
            *slot = Some(fresh);
        }
        body(slot.as_mut().expect("harbour exists"))
    })
}

/// Seed a new harbour and return its first state.
fn reset(seed: u64, weeks: u64) -> Value {
    let mut fresh = seed_game(seed);
    fresh.config.weeks_per_season = weeks.clamp(1, 12);
    fresh.config.trips_per_boat_day = DEMO_TRIPS;
    fresh.config.levy_per_crate = DEMO_LEVY;
    SHAPE.with(|shape| *shape.borrow_mut() = (seed, fresh.config.weeks_per_season));
    let state = views::view_state(&fresh);
    GAME.with(|slot| *slot.borrow_mut() = Some(fresh));
    json!({ "ok": true, "seed": seed, "state": state })
}

/// Trade-style reply: `{ok, line}` or `{error}` — the relay's shape.
fn outcome(result: Result<String, String>) -> Value {
    match result {
        Ok(line) => json!({ "ok": true, "line": line }),
        Err(error) => json!({ "error": error }),
    }
}

fn actor(name: Option<&str>) -> Result<rules::state::ActorId, String> {
    let raw = name.unwrap_or("bank");
    relay::parse_actor_name(raw).ok_or_else(|| format!("unknown captain {raw}"))
}

fn zone(name: Option<&str>) -> Result<rules::state::Zone, String> {
    let raw = name.unwrap_or("greybank");
    relay::parse_zone_name(raw).ok_or_else(|| format!("unknown zone {raw}"))
}

fn mesh(name: Option<&str>) -> rules::state::Mesh {
    match name.map(str::to_lowercase).as_deref() {
        Some("small") => rules::state::Mesh::Small,
        _ => rules::state::Mesh::Large,
    }
}

fn number(body: &Value, key: &str) -> Option<u64> {
    body.get(key).and_then(|value| {
        value
            .as_u64()
            .or_else(|| value.as_str().and_then(|text| text.parse().ok()))
    })
}

fn text<'a>(body: &'a Value, key: &str) -> Option<&'a str> {
    body.get(key).and_then(Value::as_str)
}

/// `assign`: boat id, zone or quay, optional mesh (TW-N-11, TW-C2-02).
fn assign(game: &mut Game, body: &Value) -> Value {
    use rules::state::ActorId;
    let Some(boat) = number(body, "boat") else {
        return json!({ "error": "E_BAD_ASSIGN" });
    };
    let quay = body.get("quay") == Some(&Value::Bool(true));
    let target = if quay { None } else { Some(body.get("zone").and_then(Value::as_str)) };
    let zone = match target {
        None => None,
        Some(Some(name)) => match relay::parse_zone_name(name) {
            Some(zone) => Some(zone),
            None => return json!({ "error": "E_BAD_ASSIGN" }),
        },
        Some(None) => return json!({ "error": "E_BAD_ASSIGN" }),
    };
    let net = mesh(text(body, "mesh"));
    match game.assign_boat(ActorId::You, boat, zone, net) {
        Ok(()) => json!({ "ok": true }),
        Err(error) => json!({ "error": error }),
    }
}

/// `survey`: pay for an estimate of one ground (TW-C1-03).
fn survey(game: &mut Game, body: &Value) -> Value {
    use rules::state::ActorId;
    let Ok(zone) = zone(text(body, "zone")) else {
        return json!({ "error": "E_BAD_SURVEY" });
    };
    match game.buy_survey(ActorId::You, zone) {
        Ok(survey) => serde_json::to_value(survey).unwrap_or_else(|_| json!({ "ok": true })),
        Err(error) => json!({ "error": error }),
    }
}

/// `licence`: buy or sell one, from the pool or a named captain (TW-N-22).
fn licence(game: &mut Game, body: &Value) -> Value {
    use rules::state::ActorId;
    let buying = text(body, "action").is_some_and(|a| a.eq_ignore_ascii_case("buy"));
    let reference = text(body, "ref").unwrap_or("pool");
    let pooled = reference.eq_ignore_ascii_case("pool") || reference.eq_ignore_ascii_case("bank");
    let result = if pooled {
        game.pool_licence(ActorId::You, buying)
    } else {
        match actor(Some(reference)) {
            Ok(other) if buying => game.trade_licence(other, ActorId::You),
            Ok(other) => game.trade_licence(ActorId::You, other),
            Err(error) => return json!({ "error": error }),
        }
    };
    outcome(result)
}

/// `lease`: rent a licence out, or end a lease early (TW-N-24). The quota
/// follows the lessee every Monday the rent is paid.
fn lease_op(game: &mut Game, body: &Value) -> Value {
    let (Some(lessor), Some(lessee)) = (text(body, "lessor"), text(body, "lessee")) else {
        return json!({ "error": "E_BAD_LEASE" });
    };
    let (Ok(lessor), Ok(lessee)) = (actor(Some(lessor)), actor(Some(lessee))) else {
        return json!({ "error": "E_BAD_LEASE" });
    };
    let weeks = number(body, "weeks").unwrap_or(2);
    let ending = text(body, "action").is_some_and(|a| a.eq_ignore_ascii_case("unlease"));
    outcome(if ending { game.unlease(lessor, lessee) } else { game.lease(lessor, lessee, weeks) })
}

/// `debt`: buy the note, grant a delay, or call the default (TW-C3-05).
fn debt(game: &mut Game, body: &Value) -> Value {
    use rules::state::ActorId;
    let Some(note) = number(body, "ref") else {
        return json!({ "error": "E_BAD_DEBT" });
    };
    let result = match text(body, "action").map(str::to_lowercase).as_deref() {
        Some("buy") => game.buy_note(ActorId::You, note).map(|()| format!("You hold note {note}.")),
        Some("forbear") => game.defer_loan(ActorId::You, note).map(|()| format!("Note {note} deferred.")),
        Some("seize") => game.seize_note(ActorId::You, note),
        _ => return json!({ "error": "E_BAD_DEBT" }),
    };
    outcome(result)
}

/// `council`: table a motion (and back it) or record the ballot (TW-C4-03).
fn council(game: &mut Game, body: &Value) -> Value {
    let rule = text(body, "rule").unwrap_or_default();
    let indemnity = number(body, "indemnity").unwrap_or(0);
    if text(body, "action").is_some_and(|a| a.eq_ignore_ascii_case("propose")) {
        let tabled = game.proposed_motion(rule, indemnity).map(|motion| {
            let quota = motion.quota_per_licence;
            game.propose(motion);
            game.cast_vote(true);
            format!("Motion tabled: quota {quota}.")
        });
        return outcome(tabled);
    }
    match rule.trim().to_lowercase().as_str() {
        "yes" | "for" => {
            game.cast_vote(true);
            outcome(Ok("You vote yes.".to_string()))
        }
        "no" | "against" => {
            game.cast_vote(false);
            outcome(Ok("You vote no.".to_string()))
        }
        _ => json!({ "error": "E_BAD_COUNCIL" }),
    }
}

/// `fastforward`: play `days` on a copy; the live harbour is untouched.
fn fastforward_reply(game: &Game, days: u64, seed: Option<u64>) -> Value {
    if !matches!(days, 7 | 14 | 28) {
        return json!({ "error": "E_BAD_FASTFORWARD" });
    }
    let mut copy = game.clone();
    if let Some(seed) = seed {
        copy.port.seed = seed;
    }
    let result = fastforward::run(&mut copy, days);
    json!({
        "summary": {
            "days_run": result.days_run,
            "seed": result.seed,
            "history_hash": fastforward::history_hash(&result.history).to_string(),
            "events": result.events.len(),
        },
        "journal": result.events,
        "series": views::ff_series(&result.history),
        "markers": views::ff_markers(&result.events),
    })
}

/// `export`: the whole harbour as JSON, for the browser to keep.
fn export(game: &mut Game) -> Value {
    let shape = SHAPE.with(|shape| *shape.borrow());
    json!({ "ok": true, "seed": game.port.seed, "weeks": game.config.weeks_per_season, "game": game, "storedSeed": shape.0 })
}

/// `import`: put a saved harbour back in memory, refusing anything unreadable.
fn import(body: &Value) -> Value {
    let Some(raw) = body.get("game") else {
        return json!({ "error": "E_IMPORT" });
    };
    let Ok(game) = serde_json::from_value::<Game>(raw.clone()) else {
        return json!({ "error": "E_IMPORT" });
    };
    let seed = game.port.seed;
    let weeks = game.config.weeks_per_season;
    SHAPE.with(|shape| *shape.borrow_mut() = (seed, weeks));
    let state = views::view_state(&game);
    GAME.with(|slot| *slot.borrow_mut() = Some(game));
    json!({ "ok": true, "seed": seed, "weeks": weeks, "state": state })
}

/// Route one request. `body` is the relay payload, `op` the endpoint name.
fn route(op: &str, body: &Value) -> Value {
    match op {
        "health" => json!({ "ok": true, "mode": "wasm", "sim": true }),
        "auth" => json!({ "ok": true, "token": "local", "pseudo": text(body, "pseudo").unwrap_or("captain") }),
        "state" => with_game(|game| views::view_state(game)),
        "graph" => with_game(|game| views::view_graph(game)),
        "judges" => with_game(|game| views::view_judges(game)),
        "export" => with_game(export),
        "import" => import(body),
        "init" => reset(
            number(body, "seed").unwrap_or(DEFAULT_SEED),
            number(body, "weeks").unwrap_or(DEFAULT_WEEKS),
        ),
        "reset" => {
            let (seed, weeks) = SHAPE.with(|shape| *shape.borrow());
            reset(number(body, "seed").unwrap_or(seed), number(body, "weeks").unwrap_or(weeks))
        }
        "assign" => with_game(|game| assign(game, body)),
        "survey" => with_game(|game| survey(game, body)),
        "licence" => with_game(|game| licence(game, body)),
        "lease" => with_game(|game| lease_op(game, body)),
        "debt" => with_game(|game| debt(game, body)),
        "council" => with_game(|game| council(game, body)),
        "day" => with_game(|game| match try_day(game) {
            Ok(report) => serde_json::to_value(&report).unwrap_or_else(|_| json!({ "error": "E_SIM_FAILED" })),
            Err(error) => json!({ "error": error }),
        }),
        "tick" => with_game(|game| match sim::cycle::try_tick(game) {
            Ok(ticked) => serde_json::to_value(&ticked).unwrap_or_else(|_| json!({ "closed": false })),
            Err(error) => json!({ "error": error }),
        }),
        "next-season" => with_game(|game| match sim::season::open_next_season(game) {
            Ok(season) => json!({ "ok": true, "season": season, "state": views::view_state(game) }),
            Err(error) => json!({ "error": error }),
        }),
        "fastforward" => {
            let days = number(body, "days").unwrap_or(7);
            let seed = number(body, "seed");
            with_game(|game| fastforward_reply(game, days, seed))
        }
        other => json!({ "error": "E_UNKNOWN_ENDPOINT", "detail": other }),
    }
}

/// Entry point shared by the FFI wrapper and the unit tests.
pub fn dispatch(request: &str) -> String {
    let parsed: Value = serde_json::from_str(request).unwrap_or(Value::Null);
    let op = parsed.get("op").and_then(Value::as_str).unwrap_or("health");
    let body = parsed.get("body").cloned().unwrap_or_else(|| json!({}));
    serde_json::to_string(&route(op, &body)).unwrap_or_else(|_| "{\"error\":\"E_ENCODE\"}".to_string())
}

thread_local! {
    static REPLY: RefCell<Vec<u8>> = RefCell::new(Vec::new());
}

/// Hand `len` bytes to JS, which writes the request JSON there.
#[no_mangle]
pub extern "C" fn tw_alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len.max(1));
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    pointer
}

/// Answer the request held at `ptr`: returns a pointer to the reply bytes.
#[no_mangle]
pub extern "C" fn tw_call(ptr: *const u8, len: usize) -> *const u8 {
    let request = unsafe { std::slice::from_raw_parts(ptr, len) };
    let reply = dispatch(&String::from_utf8_lossy(request));
    REPLY.with(|slot| {
        let mut slot = slot.borrow_mut();
        slot.clear();
        slot.extend_from_slice(reply.as_bytes());
        slot.as_ptr()
    })
}

/// Length of the last reply, in bytes.
#[no_mangle]
pub extern "C" fn tw_out_len() -> usize {
    REPLY.with(|slot| slot.borrow().len())
}

/// Release a buffer handed out by [`tw_alloc`].
///
/// # Safety
/// `ptr` must come from `tw_alloc` with the same `len`, and be freed once.
#[no_mangle]
pub unsafe extern "C" fn tw_free(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

#[cfg(test)]
mod tests {
    use super::dispatch;
    use serde_json::Value;

    fn call(request: &str) -> Value {
        serde_json::from_str(&dispatch(request)).expect("reply is JSON")
    }

    #[test]
    fn state_opens_a_harbour_on_first_use() {
        let state = call(r#"{"op":"state"}"#);
        assert_eq!(state["licences"], 4);
        assert_eq!(state["boats"].as_array().map(Vec::len), Some(10));
        assert_eq!(state["seasonOver"], false);
    }

    #[test]
    fn a_day_lands_lots_and_reports_them() {
        let report = call(r#"{"op":"day"}"#);
        assert!(report["landings"].as_array().is_some_and(|lots| lots.len() > 0));
        assert!(report["lines"].as_array().is_some_and(|lines| !lines.is_empty()));
    }

    #[test]
    fn unknown_endpoints_are_refused_not_guessed() {
        assert_eq!(call(r#"{"op":"nope"}"#)["error"], "E_UNKNOWN_ENDPOINT");
        assert_eq!(call(r#"{"op":"fastforward","body":{"days":9}}"#)["error"], "E_BAD_FASTFORWARD");
    }

    #[test]
    fn a_saved_harbour_comes_back_the_same() {
        call(r#"{"op":"init","body":{"seed":7,"weeks":2}}"#);
        for _ in 0..3 {
            call(r#"{"op":"day"}"#);
        }
        let saved = call(r#"{"op":"export"}"#);
        let day = saved["state"].as_object().is_none();
        assert!(day, "export carries the game, not a view");
        call(r#"{"op":"init","body":{"seed":11,"weeks":4}}"#);
        let moved = call(r#"{"op":"state"}"#);
        assert_eq!(moved["seed"], "11");
        let restored = {
            let request = serde_json::json!({ "op": "import", "body": { "game": saved["game"] } });
            serde_json::from_str::<Value>(&dispatch(&request.to_string())).expect("reply")
        };
        assert_eq!(restored["seed"], 7);
        let after = call(r#"{"op":"state"}"#);
        assert_eq!(after["seasonDays"], 14, "the saved fortnight came back");
    }

    #[test]
    fn a_licence_can_be_rented_from_the_engine() {
        call(r#"{"op":"init","body":{"seed":7,"weeks":2}}"#);
        let leased = call(r#"{"op":"lease","body":{"action":"lease","lessor":"hale","lessee":"you","weeks":2}}"#);
        assert_eq!(leased["ok"], true);
        let state = call(r#"{"op":"state"}"#);
        assert_eq!(state["leases"].as_array().map(Vec::len), Some(1));
        assert_eq!(state["captains"][0]["quotaCrates"], 350);
        let ended = call(r#"{"op":"lease","body":{"action":"unlease","lessor":"hale","lessee":"you"}}"#);
        assert_eq!(ended["ok"], true);
        assert_eq!(call(r#"{"op":"lease","body":{"lessor":"hale"}}"#)["error"], "E_BAD_LEASE");
    }

    #[test]
    fn fast_forward_plays_on_a_copy() {
        let before = call(r#"{"op":"state"}"#);
        let ff = call(r#"{"op":"fastforward","body":{"days":7,"seed":7}}"#);
        assert_eq!(ff["summary"]["days_run"], 7);
        let after = call(r#"{"op":"state"}"#);
        assert_eq!(before["day"], after["day"], "the live harbour did not move");
    }
}
