//! The game-state endpoints of the browser engine: the requests that act on
//! the harbour in memory (assign a boat, buy a licence, table a motion, pay
//! the debt owed to the sea).
//!
//! Every handler takes the harbour and the relay payload, and answers the
//! relay's own shape: `{"ok": ...}` or `{"error": ...}`. They are pure
//! adapters — the rules live in `sim` and `rules`, and are never re-implied
//! here.

use serde_json::{json, Value};
use sim::{relay, Game};

/// Trade-style reply: `{ok, line}` or `{error}` — the relay's shape.
pub fn outcome(result: Result<String, String>) -> Value {
    match result {
        Ok(line) => json!({ "ok": true, "line": line }),
        Err(error) => json!({ "error": error }),
    }
}

/// A captain by relay name ("the gull" and "gull" both work).
pub fn actor(name: Option<&str>) -> Result<rules::state::ActorId, String> {
    let raw = name.unwrap_or("bank");
    relay::parse_actor_name(raw).ok_or_else(|| format!("unknown captain {raw}"))
}

/// A zone by relay name ("the shallows" and "shallows" both work).
pub fn zone(name: Option<&str>) -> Result<rules::state::Zone, String> {
    let raw = name.unwrap_or("greybank");
    relay::parse_zone_name(raw).ok_or_else(|| format!("unknown zone {raw}"))
}

/// The net a request asks for.
pub fn mesh(name: Option<&str>) -> rules::state::Mesh {
    match name.map(str::to_lowercase).as_deref() {
        Some("small") => rules::state::Mesh::Small,
        _ => rules::state::Mesh::Large,
    }
}

/// A number in the payload, as a number or as a string of digits.
pub fn number(body: &Value, key: &str) -> Option<u64> {
    body.get(key).and_then(|value| {
        value
            .as_u64()
            .or_else(|| value.as_str().and_then(|text| text.parse().ok()))
    })
}

/// A string in the payload.
pub fn text<'a>(body: &'a Value, key: &str) -> Option<&'a str> {
    body.get(key).and_then(Value::as_str)
}

/// `assign`: boat id, zone or quay, optional mesh (TW-N-11, TW-C2-02).
pub fn assign(game: &mut Game, body: &Value) -> Value {
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
pub fn survey(game: &mut Game, body: &Value) -> Value {
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
pub fn licence(game: &mut Game, body: &Value) -> Value {
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
pub fn lease_op(game: &mut Game, body: &Value) -> Value {
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
pub fn debt(game: &mut Game, body: &Value) -> Value {
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
pub fn council(game: &mut Game, body: &Value) -> Value {
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

/// `fallow`: rest a zone for N weeks; the regrowth it performs pays the
/// debt owed to the sea (barreau 4, paid from the browser).
pub fn fallow(game: &mut Game, body: &Value) -> Value {
    let Some(name) = text(body, "zone") else {
        return json!({ "error": "E_BAD_FALLOW" });
    };
    let Some(zone) = relay::parse_zone_name(name) else {
        return json!({ "error": "E_BAD_FALLOW" });
    };
    let weeks = number(body, "weeks").unwrap_or(1);
    match game.pay_in_fallow(zone, weeks) {
        Ok(paid) => json!({ "ok": true, "paid": paid, "debt": game.sea_debt }),
        Err(error) => json!({ "error": error }),
    }
}

/// `reseed`: the port fund buys juveniles back into a zone; the debt comes
/// down by the crates that go back into the sea.
pub fn reseed(game: &mut Game, body: &Value) -> Value {
    let Some(name) = text(body, "zone") else {
        return json!({ "error": "E_BAD_RESEED" });
    };
    let Some(zone) = relay::parse_zone_name(name) else {
        return json!({ "error": "E_BAD_RESEED" });
    };
    let crates = number(body, "crates").unwrap_or(0);
    match game.pay_in_reseed(zone, crates) {
        Ok(spent) => json!({ "ok": true, "spent": spent, "debt": game.sea_debt }),
        Err(error) => json!({ "error": error }),
    }
}
