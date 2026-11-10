//! CLI argument parsers, flags, and JSON persistence for `sim`.

use rules::state::{ActorId, Mesh};
use crate::{relay, Game};
use std::process::ExitCode;

pub fn flag(args: &[String], name: &str) -> Option<String> {
    args.windows(2)
        .find(|w| w[0] == format!("--{name}"))
        .map(|w| w[1].clone())
}

pub fn has(args: &[String], name: &str) -> bool {
    args.iter().any(|arg| arg == &format!("--{name}"))
}

pub fn read_game(path: &str) -> Game {
    let text = std::fs::read_to_string(path).unwrap_or_else(|e| {
        eprintln!("cannot read {path}: {e}");
        std::process::exit(1);
    });
    serde_json::from_str(&text).unwrap_or_else(|e| {
        eprintln!("bad state {path}: {e}");
        std::process::exit(1);
    })
}

pub fn write_json(path: &str, value: &impl serde::Serialize) {
    let text = serde_json::to_string_pretty(value).expect("serialize");
    if let Err(e) = std::fs::write(path, text) {
        eprintln!("cannot write {path}: {e}");
        std::process::exit(1);
    }
}

pub fn parse_mesh(value: &str) -> Option<Mesh> {
    match value.to_lowercase().as_str() {
        "large" => Some(Mesh::Large),
        "small" => Some(Mesh::Small),
        _ => None,
    }
}

pub fn actor_flag(args: &[String], name: &str) -> ActorId {
    let raw = flag(args, name).unwrap_or_else(|| "you".to_string());
    relay::parse_actor_name(&raw).unwrap_or_else(|| {
        eprintln!("unknown actor {raw}");
        std::process::exit(1);
    })
}

/// Net a boat already carries (large when the hull number is unknown).
pub fn current_mesh(game: &Game, captain: ActorId, boat: u64) -> Mesh {
    game.port
        .boats
        .iter()
        .find(|hull| hull.id == boat && hull.owner == captain)
        .map(|hull| hull.mesh)
        .unwrap_or(Mesh::Large)
}

/// Print a hand-trade outcome and persist the game on success.
pub fn finish_trade(path: &str, game: &Game, outcome: Result<String, String>) -> ExitCode {
    match outcome {
        Ok(line) => {
            write_json(path, game);
            println!("{}", serde_json::json!({ "ok": true, "line": line }));
            ExitCode::SUCCESS
        }
        Err(error) => {
            println!("{}", serde_json::json!({ "error": error }));
            ExitCode::from(1)
        }
    }
}
