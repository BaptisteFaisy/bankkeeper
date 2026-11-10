//! `sim` CLI: the relay shells out to this binary.
//!
//! Commands (gold flags are whole pieces):
//!   sim init --seed 7 --out state.json [--levy 0.4] [--weeks 2] [--charter quota|'{"ban_small_mesh":true}']
//!   sim chronicle --state state.json
//!   sim day --state state.json [--report report.json]
//!   sim ff --state state.json --days 7|28 [--history h.json --events e.json]
//!   sim assign --state state.json --captain you --boat 0 --zone greybank [--mesh small]
//!   sim survey --state state.json --actor you --zone greybank
//!   sim propose --state state.json --quota 50 [--close greybank] [--ban-mesh] [--indemnity 10]
//!   sim refloat --state state.json --investor you --actor brandt --gold 500
//!   sim buy-boat --state state.json --captain you
//!   sim buy-note --state state.json --buyer you --loan 100
//!   sim defer --state state.json --holder bank --loan 100
//!   sim lease --state state.json --lessor hale --lessee you --weeks 2

mod cli_chronicle;

use rules::council::Proposal;
use rules::state::ActorId;
use sim::cli::{actor_flag, current_mesh, finish_trade, flag, has, parse_mesh, read_game, write_json};
use sim::cycle::try_day;
use sim::fastforward::{history_hash, run};
use sim::fund::levy_cents;
use sim::{relay, views, Game};
use std::collections::HashMap;
use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(|s| s.as_str()) {
        Some("init") => cli_chronicle::cmd_init(&args),
        Some("day") => cmd_day(&args),
        Some("tick") => cmd_tick(&args),
        Some("ff") => cmd_ff(&args),
        Some("assign") => cmd_assign(&args),
        Some("survey") => cmd_survey(&args),
        Some("propose") => cmd_propose(&args),
        Some("refloat") => cmd_refloat(&args),
        Some("buy-boat") => cmd_buy_boat(&args),
        Some("buy-note") => cmd_buy_note(&args),
        Some("defer") => cmd_defer(&args),
        Some("next-season") => cli_chronicle::cmd_next_season(&args),
        Some("harness") => sim::harness::cli(&args),
        Some("chronicle") => cli_chronicle::cmd_chronicle(&args),
        Some("charter") => cli_chronicle::cmd_charter(),
        Some("state") => cmd_view(&args, views::view_state),
        Some("graph") => cmd_view(&args, views::view_graph),
        Some("judges") => cmd_view(&args, views::view_judges),
        Some("attribution") => cmd_view(&args, views::attribution),
        Some("fastforward") => cmd_fastforward(&args),
        Some("licence") => cmd_licence(&args),
        Some("lease") | Some("unlease") => cmd_lease(&args),
        Some("debt") => cmd_debt(&args),
        Some("council") => cmd_council(&args),
        Some("favour") => cmd_favour(&args),
        Some("fallow") => cmd_fallow(&args),
        Some("reseed") => cmd_reseed(&args),
        _ => {
            eprintln!("usage: sim <init|day|tick|ff|assign|survey|propose|refloat|buy-boat|buy-note|defer|next-season|chronicle|charter|harness|state|graph|judges|attribution|fastforward|licence|lease|unlease|debt|council|favour|fallow|reseed> [flags]");
            ExitCode::from(2)
        }
    }
}

fn cmd_day(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let mut game = read_game(&path);
    let report = match try_day(&mut game) {
        Ok(report) => report,
        Err(error) => {
            println!("{}", serde_json::json!({ "error": error }));
            return ExitCode::from(1);
        }
    };
    write_json(&path, &game);
    if let Some(rp) = flag(args, "report") {
        write_json(&rp, &report);
    }
    println!("{}", serde_json::to_string(&report).expect("serialize"));
    ExitCode::SUCCESS
}

/// One lot of the day: the live build calls this every thirty seconds.
fn cmd_tick(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let mut game = read_game(&path);
    match sim::cycle::try_tick(&mut game) {
        Ok(ticked) => {
            write_json(&path, &game);
            println!("{}", serde_json::to_string(&ticked).expect("serialize"));
            ExitCode::SUCCESS
        }
        Err(error) => {
            println!("{}", serde_json::json!({ "error": error }));
            ExitCode::from(1)
        }
    }
}

fn cmd_ff(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let days: u64 = flag(args, "days").and_then(|v| v.parse().ok()).unwrap_or(7);
    if !matches!(days, 7 | 14 | 28) {
        eprintln!("days must be 7, 14 or 28");
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
    summary.insert("history_hash".to_string(), serde_json::json!(history_hash(&result.history).to_string()));
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
    } else if let Some(z) = relay::parse_zone_name(&zone_raw) {
        Some(z)
    } else {
        println!("{{\"error\":\"E_UNKNOWN_ZONE\"}}");
        return ExitCode::from(1);
    };
    let mesh = flag(args, "mesh").and_then(|raw| parse_mesh(&raw)).unwrap_or_else(|| current_mesh(&game, captain, boat));
    match game.assign_boat(captain, boat, zone, mesh) {
        Ok(()) => { write_json(&path, &game); println!("{{\"ok\":true}}"); ExitCode::SUCCESS }
        Err(error) => { println!("{}", serde_json::json!({ "error": error })); ExitCode::from(1) }
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
        Ok(survey) => { write_json(&path, &game); println!("{}", serde_json::to_string(&survey).expect("serialize")); ExitCode::SUCCESS }
        Err(error) => { println!("{}", serde_json::json!({ "error": error })); ExitCode::from(1) }
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
        quota_per_licence: quota, close_zone: close, ban_small_mesh: has(args, "ban-mesh"),
        indemnity_per_licence_week: indemnity * 100,
        funding: None,
        levy_per_crate: flag(args, "levy").map(|raw| levy_cents(&raw)),
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
    if !matches!(days, 7 | 14 | 28) {
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

fn cmd_licence(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let mut game = read_game(&path);
    let action = flag(args, "action").unwrap_or_default().to_lowercase();
    let reference = flag(args, "ref").unwrap_or_default();
    let price = flag(args, "price").and_then(|raw| raw.parse::<f64>().ok());
    let outcome = match action.as_str() {
        "buy" => licence_buy(&mut game, &reference),
        "sell" => licence_sell(&mut game, &reference, price),
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

/// Sell one licence to the pool or a named captain, at the going price or
/// at the `--price` named on the command line (gold).
fn licence_sell(game: &mut Game, reference: &str, price: Option<f64>) -> Result<String, String> {
    if reference.eq_ignore_ascii_case("pool") || reference.eq_ignore_ascii_case("bank") {
        return game.pool_licence(ActorId::You, false);
    }
    let buyer = relay::parse_actor_name(reference).ok_or_else(|| format!("unknown buyer {reference}"))?;
    let price = price.map_or(game.licence_price_now(), |gold| (gold.max(0.0) * 100.0) as u64);
    game.trade_licence_at(ActorId::You, buyer, price)
}

/// Debug: write one captain's book by hand, without replaying the deed.
fn cmd_favour(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let mut game = read_game(&path);
    let captain = actor_flag(args, "actor");
    let score: i32 = flag(args, "score").and_then(|v| v.parse().ok()).unwrap_or(0);
    let reason = format!("The judges write the book by hand (score {score}).");
    game.record_favour(captain, score - game.favour_score(captain), &reason);
    write_json(&path, &game);
    println!("{}", serde_json::json!({"ok": true, "favour": game.favour(captain)}));
    ExitCode::SUCCESS
}

/// Barreau 4: pay part of the debt owed to the sea by resting a zone for a
/// number of weeks. The zone stays shut; the regrowth it performs pays down
/// the debt. `--zone greybank --weeks 2`.
fn cmd_fallow(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let mut game = read_game(&path);
    let Some(zone) = flag(args, "zone").and_then(|raw| relay::parse_zone_name(&raw)) else {
        println!("{{\"error\":\"E_UNKNOWN_ZONE\"}}");
        return ExitCode::from(1);
    };
    let weeks: u64 = flag(args, "weeks").and_then(|v| v.parse().ok()).unwrap_or(1);
    match game.pay_in_fallow(zone, weeks) {
        Ok(paid) => {
            write_json(&path, &game);
            println!(
                "{}",
                serde_json::json!({"ok": true, "paid": paid, "debt": game.sea_debt})
            );
            ExitCode::SUCCESS
        }
        Err(error) => {
            println!("{}", serde_json::json!({ "error": error }));
            ExitCode::from(1)
        }
    }
}

/// Barreau 4: pay part of the debt by reseeding a zone out of the port fund.
/// `--zone greybank --crates 200`. The gold leaves the port, the crates go
/// back into the sea, and the debt comes down by the same crates.
fn cmd_reseed(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let mut game = read_game(&path);
    let Some(zone) = flag(args, "zone").and_then(|raw| relay::parse_zone_name(&raw)) else {
        println!("{{\"error\":\"E_UNKNOWN_ZONE\"}}");
        return ExitCode::from(1);
    };
    let crates: u64 = flag(args, "crates").and_then(|v| v.parse().ok()).unwrap_or(0);
    match game.pay_in_reseed(zone, crates) {
        Ok(spent) => {
            write_json(&path, &game);
            println!(
                "{}",
                serde_json::json!({"ok": true, "spent": spent, "debt": game.sea_debt})
            );
            ExitCode::SUCCESS
        }
        Err(error) => {
            println!("{}", serde_json::json!({ "error": error }));
            ExitCode::from(1)
        }
    }
}

/// Rent a licence out (`lease`) or end a lease early (`unlease`): the desk
/// moves the quota, never the title, and the rent falls due every Monday.
fn cmd_lease(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let mut game = read_game(&path);
    let (lessor, lessee) = (actor_flag(args, "lessor"), actor_flag(args, "lessee"));
    let weeks: u64 = flag(args, "weeks").and_then(|v| v.parse().ok()).unwrap_or(2);
    let action = flag(args, "action").unwrap_or_default().to_lowercase();
    let outcome = if action == "unlease" || args[1] == "unlease" {
        game.unlease(lessor, lessee)
    } else {
        game.lease(lessor, lessee, weeks)
    };
    finish_trade(&path, &game, outcome)
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
