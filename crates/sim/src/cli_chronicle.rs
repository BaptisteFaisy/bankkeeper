//! CLI side of the chronicle and the charter: `sim chronicle`, `sim charter`,
//! and the `--charter` flag of `sim init`.
//!
//! Split out of `main.rs` so the binary keeps one screen per subject (and
//! stays under the structural line budget). The engine owns the rules; this
//! file only reads a flag, prints JSON and explains a bad argument.

use sim::charter::Charter;
use sim::fund::levy_cents;
use sim::seed_game_with;
use sim::views;
use std::process::ExitCode;

use sim::cli::{flag, read_game, write_json};

/// `sim init --seed 7 --out state.json [--levy 0.4] [--weeks 2] [--charter <json|id>]`:
/// seed a new campaign under an optional charter and landing levy.
pub fn cmd_init(args: &[String]) -> ExitCode {
    let seed: u64 = flag(args, "seed").and_then(|v| v.parse().ok()).unwrap_or(7);
    let out = flag(args, "out").unwrap_or_else(|| "state.json".to_string());
    let charter = match charter_flag(args) {
        Ok(written) => written,
        Err(message) => {
            eprintln!("{message}");
            return ExitCode::from(1);
        }
    };
    let mut game = seed_game_with(seed, charter);
    if let Some(weeks) = flag(args, "weeks").and_then(|v| v.parse::<u64>().ok()) {
        if !(1..=12).contains(&weeks) {
            eprintln!("weeks must be between 1 and 12");
            return ExitCode::from(1);
        }
        game.config.weeks_per_season = weeks;
    }
    if let Some(levy) = flag(args, "levy") {
        game.config.levy_per_crate = levy_cents(&levy);
    }
    write_json(&out, &game);
    println!(
        "seeded {out} with seed {seed}, {} days a season",
        game.config.days_per_week * game.config.weeks_per_season
    );
    ExitCode::SUCCESS
}

/// Open the next season of the campaign: assets stay, the sea stays where it is.
pub fn cmd_next_season(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let mut game = read_game(&path);
    match sim::season::open_next_season(&mut game) {
        Ok(season) => {
            write_json(&path, &game);
            println!("{}", serde_json::json!({ "ok": true, "season": season }));
            ExitCode::SUCCESS
        }
        Err(error) => {
            println!("{}", serde_json::json!({ "error": error }));
            ExitCode::from(1)
        }
    }
}

/// `--charter <json|id>`: either a charter written out in JSON, or one of the
/// three option ids the end-of-campaign screen offers (`quota`, `mesh`, `idle`).
pub fn charter_flag(args: &[String]) -> Result<Option<Charter>, String> {
    let Some(raw) = flag(args, "charter") else {
        return Ok(None);
    };
    let text = raw.trim();
    let parsed = if text.starts_with('\x7b') {
        serde_json::from_str::<Charter>(text).ok()
    } else {
        Charter::by_id(text)
    };
    match parsed {
        Some(charter) => Ok(Some(charter)),
        None => Err(format!("bad charter: {raw} (expected JSON or one of quota|mesh|idle)")),
    }
}

/// `sim chronicle`: the port's memory, one line per closed season.
pub fn cmd_chronicle(args: &[String]) -> ExitCode {
    let path = flag(args, "state").unwrap_or_else(|| "state.json".to_string());
    let game = read_game(&path);
    let state = views::view_state(&game);
    let report = serde_json::json!({
        "chronicle": state["chronicle"],
        "charter": state["charter"],
        "campaignOver": state["campaignOver"],
        "seasons": game.chronicle.len(),
    });
    println!("{}", serde_json::to_string(&report).expect("serialize"));
    ExitCode::SUCCESS
}

/// `sim charter`: the three proposals, exactly as the screen reads them.
pub fn cmd_charter() -> ExitCode {
    let options: Vec<serde_json::Value> = Charter::options()
        .iter()
        .map(|option| {
            serde_json::json!({
                "id": option.id,
                "title": option.title,
                "detail": option.detail,
                "charter": option.charter,
                "summary": option.charter.summary(),
            })
        })
        .collect();
    println!("{}", serde_json::to_string(&serde_json::json!({ "options": options })).expect("serialize"));
    ExitCode::SUCCESS
}
