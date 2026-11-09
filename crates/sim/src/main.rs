//! `sim` CLI: the relay shells out to this binary.
//!
//! Commands (gold flags are whole pieces):
//!   sim init --seed 7 --out state.json
//!   sim day --state state.json [--report report.json]
//!   sim ff --state state.json --days 7|28 [--history h.json --events e.json]
//!   sim assign --state state.json --captain you --boat 0 --zone greybank [--mesh small]
//!   sim survey --state state.json --actor you --zone greybank
//!   sim propose --state state.json --quota 50 [--close greybank] [--ban-mesh] [--indemnity 10]
//!   sim refloat --state state.json --investor you --actor brandt --gold 500
//!   sim buy-boat --state state.json --captain you
//!   sim buy-note --state state.json --buyer you --loan 100
//!   sim defer --state state.json --holder bank --loan 100

use rules::council::Proposal;
use rules::state::{ActorId, Mesh};
use sim::cycle::run_day;
use sim::fastforward::{history_hash, run};
use sim::{relay, seed_game, views, Game};
use std::collections::HashMap;
use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(|s| s.as_str()) {
        Some("init") => cmd_init(&args),
        Some("day") => cmd_day(&args),
        Some("ff") => cmd_ff(&args),
        Some("assign") => cmd_assign(&args),
        Some("survey") => cmd_survey(&args),
        Some("propose") => cmd_propose(&args),
        Some("refloat") => cmd_refloat(&args),
        Some("buy-boat") => cmd_buy_boat(&args),
        Some("buy-note") => cmd_buy_note(&args),
        Some("defer") => cmd_defer(&args),
        Some("state") => cmd_view(&args, views::view_state),
        Some("graph") => cmd_view(&args, views::view_graph),
        Some("judges") => cmd_view(&args, views::view_judges),
        Some("fastforward") => cmd_fastforward(&args),
        Some("licence") => cmd_licence(&args),
        Some("debt") => cmd_debt(&args),
        Some("council") => cmd_council(&args),
        _ => {
            eprintln!("usage: sim <init|day|ff|assign|survey|propose|refloat|buy-boat|buy-note|defer|state|graph|judges|fastforward|licence|debt|council> [flags]");
            ExitCode::from(2)
        }
    }
}

fn flag(args: &[String], name: &str) -> Option<String> {
    args.windows(2)
        .find(|w| w[0] == format!("--{name}"))
        .map(|w| w[1].clone())
}

fn has(args: &[String], name: &str) -> bool {
    args.iter().any(|arg| arg == &format!("--{name}"))
}

fn read_game(path: &str) -> Game {
    let text = std::fs::read_to_string(path).unwrap_or_else(|e| {
        eprintln!("cannot read {path}: {e}");
        std::process::exit(1);
    });
    serde_json::from_str(&text).unwrap_or_else(|e| {
        eprintln!("bad state {path}: {e}");
        std::process::exit(1);
    })
}

fn write_json(path: &str, value: &impl serde::Serialize) {
    let text = serde_json::to_string_pretty(value).expect("serialize");
    if let Err(e) = std::fs::write(path, text) {
        eprintln!("cannot write {path}: {e}");
        std::process::exit(1);
    }
}

fn parse_mesh(value: &str) -> Option<Mesh> {
    match value.to_lowercase().as_str() {
        "large" => Some(Mesh::Large),
        "small" => Some(Mesh::Small),
        _ => None,
    }
}

fn actor_flag(args: &[String], name: &str) -> ActorId {
    let raw = flag(args, name).unwrap_or_else(|| "you".to_string());
    relay::parse_actor_name(&raw).unwrap_or_else(|| {
        eprintln!("unknown actor {raw}");
        std::process::exit(1);
    })
}

/// Net a boat already carries (large when the hull number is unknown).
fn current_mesh(game: &Game, captain: ActorId, boat: u64) -> Mesh {
    game.port.boats.iter().find(|hull| hull.id == boat && hull.owner == captain).map(|hull| hull.mesh).unwrap_or(Mesh::Large)
}

fn cmd_init(args: &[String]) -> ExitCode {
    let seed: u64 = flag(args, "seed").and_then(|v| v.parse().ok()).unwrap_or(7);
    let out = flag(args, "out").unwrap_or_else(|| "state.json".to_string());
    write_json(&out, &seed_game(seed));
    println!("seeded {out} with seed {seed}");
    ExitCode::SUCCESS
}

fn cmd_day(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let mut game = read_game(&path);
    let report = run_day(&mut game);
    write_json(&path, &game);
    if let Some(rp) = flag(args, "report") {
        write_json(&rp, &report);
    }
    println!("{}", serde_json::to_string(&report).expect("serialize"));
    ExitCode::SUCCESS
}

fn cmd_ff(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let days: u64 = flag(args, "days").and_then(|v| v.parse().ok()).unwrap_or(7);
    if days != 7 && days != 28 {
        eprintln!("days must be 7 or 28");
        return ExitCode::from(1);
    }
    let mut game = read_game(&path);
    let result = run(&mut game, days);
    write_json(&path, &result.final_game);
    if let Some(hp) = flag(args, "history") {
        write_json(&hp, &result.history);
    }
    if let Some(ep) = flag(args, "events") {
        write_json(&ep, &result.events);
    }
    let mut summary = HashMap::new();
    summary.insert("days_run".to_string(), serde_json::json!(result.days_run));
    summary.insert("seed".to_string(), serde_json::json!(result.seed));
    summary.insert(
        "history_hash".to_string(),
        // String, not number: u64 exceeds the 2^53 JSON-number range.
        serde_json::json!(history_hash(&result.history).to_string()),
    );
    summary.insert("events".to_string(), serde_json::json!(result.events.len()));
    println!("{}", serde_json::to_string(&summary).expect("serialize"));
    ExitCode::SUCCESS
}

fn cmd_assign(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let mut game = read_game(&path);
    let captain = actor_flag(args, "captain");
    let boat: u64 = flag(args, "boat").and_then(|v| v.parse().ok()).unwrap_or(0);
    let zone_raw = flag(args, "zone").unwrap_or_else(|| "quay".to_string());
    let zone = if zone_raw.to_lowercase() == "quay" {
        None
    } else {
        match relay::parse_zone_name(&zone_raw) {
            Some(zone) => Some(zone),
            None => {
                println!("{{\"error\":\"E_UNKNOWN_ZONE\"}}");
                return ExitCode::from(1);
            }
        }
    };
    let mesh = flag(args, "mesh")
        .and_then(|raw| parse_mesh(&raw))
        .unwrap_or_else(|| current_mesh(&game, captain, boat));
    match game.assign_boat(captain, boat, zone, mesh) {
        Ok(()) => {
            write_json(&path, &game);
            println!("{{\"ok\":true}}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            println!("{}", serde_json::json!({ "error": error }));
            ExitCode::from(1)
        }
    }
}

fn cmd_survey(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let mut game = read_game(&path);
    let actor = actor_flag(args, "actor");
    let Some(zone) = flag(args, "zone").and_then(|raw| relay::parse_zone_name(&raw)) else {
        println!("{{\"error\":\"E_UNKNOWN_ZONE\"}}");
        return ExitCode::from(1);
    };
    match game.buy_survey(actor, zone) {
        Ok(survey) => {
            write_json(&path, &game);
            println!("{}", serde_json::to_string(&survey).expect("serialize"));
            ExitCode::SUCCESS
        }
        Err(error) => {
            println!("{}", serde_json::json!({ "error": error }));
            ExitCode::from(1)
        }
    }
}

fn cmd_propose(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let mut game = read_game(&path);
    let quota: u64 = flag(args, "quota").and_then(|v| v.parse().ok()).unwrap_or(70);
    let close = flag(args, "close").and_then(|raw| relay::parse_zone_name(&raw));
    if flag(args, "close").is_some() && close.is_none() {
        println!("{{\"error\":\"E_UNKNOWN_ZONE\"}}");
        return ExitCode::from(1);
    }
    let indemnity: u64 = flag(args, "indemnity").and_then(|v| v.parse().ok()).unwrap_or(0);
    game.propose(Proposal {
        quota_per_licence: quota,
        close_zone: close,
        ban_small_mesh: has(args, "ban-mesh"),
        indemnity_per_licence_week: indemnity * 100,
    });
    write_json(&path, &game);
    println!("{{\"ok\":true}}");
    ExitCode::SUCCESS
}

fn cmd_refloat(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let mut game = read_game(&path);
    let investor = actor_flag(args, "investor");
    let actor = actor_flag(args, "actor");
    let gold: u64 = flag(args, "gold").and_then(|v| v.parse().ok()).unwrap_or(0);
    match game.refloat(investor, actor, gold * 100) {
        Ok(()) => {
            write_json(&path, &game);
            println!("{{\"ok\":true}}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            println!("{}", serde_json::json!({ "error": error }));
            ExitCode::from(1)
        }
    }
}

fn cmd_buy_boat(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let mut game = read_game(&path);
    let captain = actor_flag(args, "captain");
    match game.buy_boat(captain) {
        Ok(boat) => {
            write_json(&path, &game);
            println!("{{\"ok\":true,\"boat\":{boat}}}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            println!("{}", serde_json::json!({ "error": error }));
            ExitCode::from(1)
        }
    }
}

fn cmd_buy_note(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let mut game = read_game(&path);
    let buyer = actor_flag(args, "buyer");
    let loan: u64 = flag(args, "loan").and_then(|v| v.parse().ok()).unwrap_or(100);
    match game.buy_note(buyer, loan) {
        Ok(()) => {
            write_json(&path, &game);
            println!("{{\"ok\":true}}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            println!("{}", serde_json::json!({ "error": error }));
            ExitCode::from(1)
        }
    }
}

fn cmd_defer(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let mut game = read_game(&path);
    let holder = actor_flag(args, "holder");
    let loan: u64 = flag(args, "loan").and_then(|v| v.parse().ok()).unwrap_or(100);
    match game.defer_loan(holder, loan) {
        Ok(()) => {
            write_json(&path, &game);
            println!("{{\"ok\":true}}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            println!("{}", serde_json::json!({ "error": error }));
            ExitCode::from(1)
        }
    }
}

/// Read-only relay query: print one player view as JSON.
fn cmd_view(args: &[String], view: fn(&Game) -> serde_json::Value) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let game = read_game(&path);
    println!("{}", serde_json::to_string(&view(&game)).expect("serialize"));
    ExitCode::SUCCESS
}

/// Relay fast-forward: like `ff`, but writes the journal, series, and
/// markers files the relay contract names.
fn cmd_fastforward(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let days: u64 = flag(args, "days").and_then(|v| v.parse().ok()).unwrap_or(7);
    if days != 7 && days != 28 {
        println!("{{\"error\":\"E_BAD_FASTFORWARD\"}}");
        return ExitCode::from(1);
    }
    let mut game = read_game(&path);
    let result = run(&mut game, days);
    write_json(&path, &result.final_game);
    if let Some(journal) = flag(args, "journal") {
        write_json(&journal, &result.events);
    }
    if let Some(series) = flag(args, "series") {
        write_json(&series, &views::ff_series(&result.history));
    }
    if let Some(markers) = flag(args, "markers") {
        write_json(&markers, &views::ff_markers(&result.events));
    }
    let summary = serde_json::json!({
        "days_run": result.days_run,
        "seed": result.seed,
        "history_hash": history_hash(&result.history).to_string(),
        "events": result.events.len(),
    });
    println!("{}", serde_json::to_string(&summary).expect("serialize"));
    ExitCode::SUCCESS
}

/// Print a hand-trade outcome and persist the game on success.
fn finish_trade(path: &str, game: &Game, outcome: Result<String, String>) -> ExitCode {
    match outcome {
        Ok(line) => {
            write_json(path, game);
            println!("{}", serde_json::json!({"ok": true, "line": line}));
            ExitCode::SUCCESS
        }
        Err(error) => {
            println!("{}", serde_json::json!({ "error": error }));
            ExitCode::from(1)
        }
    }
}

fn cmd_licence(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let mut game = read_game(&path);
    let action = flag(args, "action").unwrap_or_default().to_lowercase();
    let reference = flag(args, "ref").unwrap_or_default();
    let outcome = match action.as_str() {
        "buy" => licence_buy(&mut game, &reference),
        "sell" => licence_sell(&mut game, &reference),
        _ => Err("licence needs buy|sell".to_string()),
    };
    finish_trade(&path, &game, outcome)
}

/// Buy one licence from the pool or a named captain, at the going price.
fn licence_buy(game: &mut Game, reference: &str) -> Result<String, String> {
    if reference.eq_ignore_ascii_case("pool") || reference.eq_ignore_ascii_case("bank") {
        return game.pool_licence(ActorId::You, true);
    }
    let seller = relay::parse_actor_name(reference).ok_or_else(|| format!("unknown seller {reference}"))?;
    game.trade_licence(seller, ActorId::You)
}

/// Sell one licence to the pool or a named captain, at the going price.
fn licence_sell(game: &mut Game, reference: &str) -> Result<String, String> {
    if reference.eq_ignore_ascii_case("pool") || reference.eq_ignore_ascii_case("bank") {
        return game.pool_licence(ActorId::You, false);
    }
    let buyer = relay::parse_actor_name(reference).ok_or_else(|| format!("unknown buyer {reference}"))?;
    game.trade_licence(ActorId::You, buyer)
}

fn cmd_debt(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let mut game = read_game(&path);
    let action = flag(args, "action").unwrap_or_default().to_lowercase();
    let loan: u64 = flag(args, "ref").and_then(|v| v.parse().ok()).unwrap_or(u64::MAX);
    let outcome = match action.as_str() {
        "buy" => game.buy_note(ActorId::You, loan).map(|()| format!("You hold note {loan}.")),
        "forbear" => game.defer_loan(ActorId::You, loan).map(|()| format!("Note {loan} deferred.")),
        "seize" => game.seize_note(ActorId::You, loan),
        _ => Err("debt needs buy|forbear|seize".to_string()),
    };
    finish_trade(&path, &game, outcome)
}

fn cmd_council(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let mut game = read_game(&path);
    let action = flag(args, "action").unwrap_or_default().to_lowercase();
    let rule = flag(args, "rule").unwrap_or_default();
    let indemnity = flag(args, "indemnity").and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0).max(0.0) as u64;
    let outcome = match action.as_str() {
        "propose" => game.proposed_motion(&rule, indemnity).map(|motion| {
            let quota = motion.quota_per_licence;
            game.propose(motion);
            game.cast_vote(true);
            format!("Motion tabled: quota {quota}.")
        }),
        "vote" => council_vote(&mut game, &rule),
        _ => Err("council needs propose|vote".to_string()),
    };
    finish_trade(&path, &game, outcome)
}

/// Record the player's ballot: yes/for backs the motion, no/against opposes.
fn council_vote(game: &mut Game, rule: &str) -> Result<String, String> {
    match rule.trim().to_lowercase().as_str() {
        "yes" | "for" => {
            game.cast_vote(true);
            Ok("You vote yes.".to_string())
        }
        "no" | "against" => {
            game.cast_vote(false);
            Ok("You vote no.".to_string())
        }
        _ => Err("vote needs yes|no".to_string()),
    }
}
