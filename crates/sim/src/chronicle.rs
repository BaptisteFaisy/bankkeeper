//! The port's memory: one public entry per closed season.
//!
//! The bilan on the season-end card is the player's private reckoning; the
//! chronicle is what the harbour writes in its book and reads back later:
//! what the season was worth, what it left in the sea, who was stopped, which
//! rule carried, and the seed that would replay it. It survives a reload, a
//! next-season and a wasm export/import because it lives on the [`Game`].

use crate::Game;
use rules::council::Proposal;
use rules::state::ActorId;
use serde::{Deserialize, Serialize};

/// One closed season, as the harbour remembers it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChronicleEntry {
    /// Season number as the council wrote it (1-based, like its minutes).
    pub season: u64,
    /// Player net worth at the close, in centigold (purse + licences + hulls).
    pub net_worth: i64,
    /// Real zone stocks left when the books closed, in crates.
    pub stocks: [u64; 3],
    /// Actors whose stop was still in force (or fell on the closing day).
    pub closures: Vec<String>,
    /// The rule the council carried, if a motion was tabled and passed.
    #[serde(default)]
    pub rule: Option<String>,
    /// Seed of the season, so the entry can be replayed.
    pub seed: u64,
}

/// One line of a carried motion, readable without the tally.
pub fn rule_text(proposal: &Proposal) -> String {
    let mut parts = vec![format!("quota {}", proposal.quota_per_licence)];
    if let Some(zone) = proposal.close_zone {
        parts.push(format!("{} closed", zone.name()));
    }
    if proposal.ban_small_mesh {
        parts.push("small mesh banned".to_string());
    }
    parts.join(" · ")
}

/// The rule a season carried: only a tabled motion that actually passed is a
/// rule of the port. A failed motion or a silent council leaves no trace.
pub fn carried_rule(game: &Game) -> Option<String> {
    let council = game.last_council.as_ref()?;
    if !council.tabled || !council.tally.passed {
        return None;
    }
    Some(rule_text(&council.proposal))
}

/// Actors the chronicle records as stopped when the books close.
///
/// Reading: the harbour has no per-day log of stops it can replay after the
/// fact — `DayRecord` carries the day's catch, not the day's closures — so the
/// chronicle writes down the stops **still in force** at the close (a captain
/// still laid up, a buyer still shut), plus the ones that fell on the closing
/// day itself, which arrive in that day's report. A captain rescued during the
/// season sails again and is therefore not in the book: the chronicle keeps
/// what the port enforces, not what it once suffered.
pub fn season_closures(game: &Game) -> Vec<String> {
    let closing_day = game
        .last_report
        .as_ref()
        .map(|report| report.closures.clone())
        .unwrap_or_default();
    let mut names = Vec::new();
    for actor in ActorId::all() {
        let stopped = game.port.stopped[actor.idx()];
        if stopped || closing_day.contains(&actor) {
            names.push(actor.name().to_string());
        }
    }
    names
}

/// Season number as the chronicle and the council write it: 1-based, read
/// before the day counter tips the port into the next season.
pub fn chronicle_season(game: &Game) -> u64 {
    let season = game.port.season(&game.config);
    if season == 0 {
        1
    } else {
        season
    }
}

/// Build the entry a just-closed season leaves behind.
pub fn entry_for_closed_season(game: &Game, net_worth: i64) -> ChronicleEntry {
    ChronicleEntry {
        season: chronicle_season(game),
        net_worth,
        stocks: game.port.stocks,
        closures: season_closures(game),
        rule: carried_rule(game),
        seed: game.port.seed,
    }
}
