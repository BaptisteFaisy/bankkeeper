//! The charter: the one rule a player writes at the end of a campaign, and
//! which governs the campaigns that follow.
//!
//! A campaign is three seasons; at the end of the third the player is asked
//! what the port should *become*, not what it should do this week. The answer
//! is a [`Charter`], kept in the browser's storage and handed to the engine at
//! `init`, so a new campaign starts under the rule the last one voted.
//!
//! Timing is deliberate: **a charter never touches the campaign that wrote
//! it.** It is applied in [`seed_game_with`](crate::seed_game_with), i.e. at
//! the opening of a campaign, and `open_next_season` never re-applies it — the
//! three seasons of a campaign all run under the same rule.

use crate::Game;
use rules::state::{ActorId, Mesh};
use serde::{Deserialize, Serialize};

/// A licence held but not fished for two weeks owes this share (10%) of the
/// licence price every Monday.
pub const IDLE_TAX_BPS: u64 = 1_000;
/// The quota the "the quota falls" option writes into the charter.
pub const CHARTER_QUOTA: u64 = 50;

/// Exact text of the three options, as the end-of-campaign screen shows them.
pub const OPTION_QUOTA_TITLE: &str = "The quota falls";
pub const OPTION_QUOTA_DETAIL: &str =
    "A licence lands fifty crates a week instead of seventy. The sea breathes; every purse tightens.";
pub const OPTION_MESH_TITLE: &str = "The small mesh is banned";
pub const OPTION_MESH_DETAIL: &str =
    "No boat may fish a fine net. Fewer young fish taken now, more grown fish for the seasons after.";
pub const OPTION_IDLE_TITLE: &str = "Idle licences pay";
pub const OPTION_IDLE_DETAIL: &str =
    "A licence held but not fished for two weeks owes a tenth of its price every Monday. Unpaid, it goes back to the pool.";

/// The institution: at most one standing rule per field, all optional.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct Charter {
    /// Weekly crates per licence; `None` keeps the port's own figure.
    #[serde(default)]
    pub quota_per_licence: Option<u64>,
    /// No boat may sail a small net at all.
    #[serde(default)]
    pub ban_small_mesh: bool,
    /// Share of the licence price charged weekly on a dormant licence, in bps.
    #[serde(default)]
    pub idle_licence_tax_bps: Option<u64>,
}

/// One proposal on the charter screen: a stable id, the exact texts, and the
/// charter it writes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CharterOption {
    pub id: &'static str,
    pub title: &'static str,
    pub detail: &'static str,
    pub charter: Charter,
}

impl Charter {
    /// The three proposals offered at the end of a campaign, in order.
    pub fn options() -> [CharterOption; 3] {
        [
            CharterOption {
                id: "quota",
                title: OPTION_QUOTA_TITLE,
                detail: OPTION_QUOTA_DETAIL,
                charter: Charter { quota_per_licence: Some(CHARTER_QUOTA), ..Charter::default() },
            },
            CharterOption {
                id: "mesh",
                title: OPTION_MESH_TITLE,
                detail: OPTION_MESH_DETAIL,
                charter: Charter { ban_small_mesh: true, ..Charter::default() },
            },
            CharterOption {
                id: "idle",
                title: OPTION_IDLE_TITLE,
                detail: OPTION_IDLE_DETAIL,
                charter: Charter { idle_licence_tax_bps: Some(IDLE_TAX_BPS), ..Charter::default() },
            },
        ]
    }

    /// The charter behind a short option id (`quota`, `mesh`, `idle`).
    pub fn by_id(id: &str) -> Option<Charter> {
        let wanted = id.trim().to_lowercase();
        Self::options().into_iter().find(|option| option.id == wanted).map(|option| option.charter)
    }

    /// True when the charter writes no rule at all.
    pub fn is_empty(&self) -> bool {
        self.quota_per_licence.is_none() && !self.ban_small_mesh && self.idle_licence_tax_bps.is_none()
    }

    /// One-line reading of the charter, for a view or a journal line.
    pub fn summary(&self) -> String {
        let mut parts = Vec::new();
        if let Some(quota) = self.quota_per_licence {
            parts.push(format!("quota {quota}"));
        }
        if self.ban_small_mesh {
            parts.push("small mesh banned".to_string());
        }
        if let Some(bps) = self.idle_licence_tax_bps {
            parts.push(format!("idle licences taxed {}%", bps as f64 / 100.0));
        }
        if parts.is_empty() {
            "no charter".to_string()
        } else {
            parts.join(" · ")
        }
    }

    /// Write the charter into a freshly seeded campaign: the quota the port
    /// works to, and the net no boat may rig. The idle tax is not a starting
    /// value — [`levy_idle_tax`] charges it every Monday the campaign runs.
    pub fn apply(&self, game: &mut Game) {
        if let Some(quota) = self.quota_per_licence {
            game.config.quota_per_licence = quota;
        }
        if self.ban_small_mesh {
            game.small_mesh_banned = true;
            for boat in game.port.boats.iter_mut() {
                boat.mesh = Mesh::Large;
            }
        }
    }
}

/// True when the captain has sailed no trip in the last `window` days.
fn slept_all_window(game: &Game, captain: ActorId, window: u64) -> bool {
    !game
        .recent(window as usize)
        .iter()
        .any(|record| record.captain_trips[captain.idx()] > 0)
}

/// Monday levy on dormant licences (charter option 3), actor by actor.
///
/// A captain who has sailed nothing for a fortnight owes `bps` of the licence
/// price per licence held; the gold goes to the bank. When a purse cannot
/// cover the bill, the harbour takes the licence back instead and pools it, so
/// the token leaves a dormant hand rather than waiting for a payment that will
/// never come. The levy waits for a full fortnight of journal before it calls
/// anybody dormant: an empty log is not evidence of idleness.
pub fn levy_idle_tax(game: &mut Game) -> Vec<String> {
    let Some(bps) = game.charter.as_ref().and_then(|charter| charter.idle_licence_tax_bps) else {
        return Vec::new();
    };
    let window = game.config.days_per_week.saturating_mul(2);
    if bps == 0 || game.port.day < window {
        return Vec::new();
    }
    let tax = game.licence_price_now().saturating_mul(bps) / 10_000;
    if tax == 0 {
        return Vec::new();
    }
    let mut lines = Vec::new();
    for captain in ActorId::captains() {
        if slept_all_window(game, captain, window) {
            lines.extend(charge_one_captain(game, captain, tax));
        }
    }
    lines
}

/// Charge one dormant captain: pay what the purse covers, pool the rest.
fn charge_one_captain(game: &mut Game, captain: ActorId, tax: u64) -> Vec<String> {
    let idx = captain.idx();
    let held = game.port.licences[idx];
    if held == 0 {
        return Vec::new();
    }
    let mut paid = 0u64;
    let mut pooled = 0u64;
    for _ in 0..held {
        if game.port.gold[idx] >= tax as i64 {
            game.port.gold[idx] -= tax as i64;
            game.port.gold[ActorId::Bank.idx()] += tax as i64;
            paid += 1;
        } else {
            game.port.licences[idx] -= 1;
            game.port.licence_pool += 1;
            pooled += 1;
        }
    }
    levy_line(captain, paid, pooled, tax)
}

/// One journal line for the levy, empty when nothing was charged.
fn levy_line(captain: ActorId, paid: u64, pooled: u64, tax: u64) -> Vec<String> {
    let mut lines = Vec::new();
    if paid > 0 {
        lines.push(format!(
            "{} pays the idle-licence tax on {paid} licences ({}).",
            captain.name(),
            crate::fmt_gold((paid * tax) as i64)
        ));
    }
    if pooled > 0 {
        lines.push(format!(
            "{} cannot pay the idle-licence tax; {pooled} licences go back to the pool.",
            captain.name()
        ));
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_three_options_write_three_rules() {
        let options = Charter::options();
        assert_eq!(options.len(), 3);
        assert_eq!(options[0].charter.quota_per_licence, Some(50));
        assert!(options[1].charter.ban_small_mesh);
        assert_eq!(options[2].charter.idle_licence_tax_bps, Some(IDLE_TAX_BPS));
        assert_eq!(Charter::by_id("mesh"), Some(options[1].charter.clone()));
        assert_eq!(Charter::by_id("nope"), None);
        assert!(Charter::default().is_empty());
        assert_eq!(Charter::default().summary(), "no charter");
    }
}
