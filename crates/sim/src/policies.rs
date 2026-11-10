//! Player policies for the balance harness: what a captain does at dawn.
//!
//! Each policy is one decision taken on the journal the player can actually
//! read — yesterday's landings, the zone lines, the licence price — never on
//! the real zone stocks, so the harness never hands the player a survey the
//! game would charge 80 gold for. Orders go through [`Game::assign_boat`],
//! which keeps the nets-switch-at-quay rule (TW-C2-02) intact: a policy that
//! wants another net drops the boat at the quay first, exactly like a hand.
//!
//! The four policies are the ones the balance brief names: a player who does
//! nothing, a player who chases the best trip, a player who husbands the sea,
//! and a player who starts greedy and turns steward.

use rules::council::Proposal;
use rules::state::{ActorId, Mesh, Zone};
use rules::trips::quota_left;
use serde::{Deserialize, Serialize};

use crate::reading::best_zone_yesterday;
use crate::Game;

/// Quota per licence the steward votes for at the season-end council.
pub const STEWARD_QUOTA: u64 = 50;
/// Gold (centigold) the steward keeps in hand before buying an idle licence:
/// two weeks of crew wages for a two-boat fleet.
pub const STEWARD_RESERVE: i64 = 20_000;
/// Licences the steward is willing to hold idle (the port cap is 8).
pub const STEWARD_IDLE_CAP: u64 = 6;
/// Boats the steward keeps working the threatened bank.
pub const STEWARD_BOATS: usize = 2;
/// Days of journal the steward compares to spot a bank in decline.
pub const STEWARD_WINDOW: usize = 7;

/// One way of playing the harbour, as the harness names it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Policy {
    /// No orders at all: the player's boats stay at quay (today's `ff`).
    Passive,
    /// Everything on yesterday's best trip, small mesh while quota lasts.
    Greedy,
    /// Two boats on the most threatened bank, large mesh, idle licences,
    /// and a vote for a smaller quota.
    Steward,
    /// Greedy for the opening season, steward after it.
    Mixed,
}

impl Policy {
    /// Every policy in report order.
    pub fn all() -> [Policy; 4] {
        [Policy::Passive, Policy::Greedy, Policy::Steward, Policy::Mixed]
    }

    /// Name used on the command line and as the report key.
    pub fn name(self) -> &'static str {
        match self {
            Policy::Passive => "passive",
            Policy::Greedy => "greedy",
            Policy::Steward => "steward",
            Policy::Mixed => "mixed",
        }
    }

    /// Parse a `--policy` value; `None` when the name is unknown.
    pub fn parse(value: &str) -> Option<Policy> {
        Policy::all()
            .into_iter()
            .find(|policy| policy.name() == value.trim().to_lowercase())
    }
}

/// What the policy does once, before the first dawn (the passive baseline
/// parks the fleet, matching `ff`'s "no player" run).
pub fn opening(policy: Policy, game: &mut Game) {
    if policy != Policy::Passive {
        return;
    }
    for boat in game.boats_of(ActorId::You) {
        let id = game.port.boats[boat].id;
        let _ = set_boat(game, id, None, Mesh::Large);
    }
}

/// One morning of orders. Returns the lines a journal page would show.
pub fn morning(policy: Policy, game: &mut Game) -> Vec<String> {
    if game.over {
        return Vec::new();
    }
    match policy {
        Policy::Passive => Vec::new(),
        Policy::Greedy => greedy(game),
        Policy::Steward => steward(game),
        Policy::Mixed => {
            if game.port.season(&game.config) == 0 {
                greedy(game)
            } else {
                steward(game)
            }
        }
    }
}

/// Greedy: everything on yesterday's best trip; small mesh while the weekly
/// quota still allows a landing (the net that catches 40% more).
fn greedy(game: &mut Game) -> Vec<String> {
    let Some(zone) = best_zone(game) else {
        return park_everything(game, "every zone is closed");
    };
    let me = ActorId::You;
    let left = quota_left(
        game.port.licences[me.idx()],
        game.port.weekly_catch[me.idx()],
        &game.config,
    );
    let mesh = if left > 0 && mesh_allowed(game, Mesh::Small) {
        Mesh::Small
    } else {
        Mesh::Large
    };
    let boats = player_boats(game);
    for boat in &boats {
        let _ = set_boat(game, *boat, Some(zone), mesh);
    }
    vec![format!(
        "You send {} boats to {} on {}: {left} crates of quota left this week.",
        boats.len(),
        zone.name(),
        mesh.name()
    )]
}

/// Steward: two boats on the bank that is slipping, large mesh, a licence
/// bought to stay unfished, and a vote for a smaller quota.
fn steward(game: &mut Game) -> Vec<String> {
    let mut lines = Vec::new();
    let boats = player_boats(game);
    let zone = most_threatened(game);
    for (rank, boat) in boats.iter().enumerate() {
        let target = if rank < STEWARD_BOATS { zone } else { None };
        let _ = set_boat(game, *boat, target, Mesh::Large);
    }
    lines.push(steward_line(zone, boats.len().min(STEWARD_BOATS)));
    if game.port.day.is_multiple_of(game.config.days_per_week.max(1)) {
        lines.extend(buy_idle_licence(game));
    }
    vote_quota_cut(game);
    lines
}

/// Journal line for the steward's dawn.
fn steward_line(zone: Option<Zone>, boats: usize) -> String {
    match zone {
        Some(zone) => format!(
            "You keep {boats} boats on {} (large mesh); the net stays light and the rest of the fleet stays at quay.",
            zone.name()
        ),
        None => "You keep the whole fleet at quay: every zone is closed.".to_string(),
    }
}

/// The steward buys one licence a week to leave it unfished: a licence held
/// and not fished removes 70 crates a week of pressure from the sea (TW-N-23).
fn buy_idle_licence(game: &mut Game) -> Option<String> {
    let me = ActorId::You;
    if game.port.stopped[me.idx()] {
        return None;
    }
    let cap = game.config.licence_cap_per_captain.min(STEWARD_IDLE_CAP.max(1));
    if game.port.licences[me.idx()] >= cap.max(1) {
        return None;
    }
    let price = game.licence_price_now() as i64;
    if game.port.gold[me.idx()] < price + STEWARD_RESERVE {
        return None;
    }
    if game.port.licence_pool > 0 {
        return game.pool_licence(me, true).ok();
    }
    let seller = [ActorId::Hale, ActorId::Brandt, ActorId::Okoro]
        .into_iter()
        .find(|seller| !game.port.stopped[seller.idx()] && game.port.licences[seller.idx()] > 1)?;
    game.trade_licence(seller, me).ok()
}

/// The steward tables a smaller quota every morning: the motion is consumed
/// at the season-end council, so keeping it armed costs nothing.
fn vote_quota_cut(game: &mut Game) {
    game.propose(Proposal {
        quota_per_licence: STEWARD_QUOTA.min(game.config.quota_per_licence),
        close_zone: None,
        ban_small_mesh: false,
        indemnity_per_licence_week: 0,
        levy_per_crate: None,
    });
    game.cast_vote(true);
}

/// Open zone with the best catch per trip yesterday, else the opening ground.
fn best_zone(game: &Game) -> Option<Zone> {
    best_zone_yesterday(game).or_else(|| fallback_zone(game))
}

/// First open zone, preferring Greybank (the opening ground).
fn fallback_zone(game: &Game) -> Option<Zone> {
    if !game.closed[Zone::Greybank.idx()] {
        return Some(Zone::Greybank);
    }
    Zone::all()
        .into_iter()
        .find(|zone| !game.closed[zone.idx()])
}

/// True when the council still allows that net.
fn mesh_allowed(game: &Game, mesh: Mesh) -> bool {
    mesh == Mesh::Large || !game.small_mesh_banned
}

/// Boat ids of the player's fleet, in fleet order.
fn player_boats(game: &Game) -> Vec<u64> {
    game.boats_of(ActorId::You)
        .into_iter()
        .map(|index| game.port.boats[index].id)
        .collect()
}

/// Send one boat: park it, switch the net at the quay (TW-C2-02), then sail.
/// The game refuses a net change on a boat already at sea, so a policy that
/// wants another net does exactly what a hand does: moor first.
fn set_boat(game: &mut Game, boat: u64, zone: Option<Zone>, mesh: Mesh) -> bool {
    let me = ActorId::You;
    if game.assign_boat(me, boat, None, mesh).is_err() {
        let current = game
            .port
            .boats
            .iter()
            .find(|hull| hull.id == boat)
            .map(|hull| hull.mesh)
            .unwrap_or(Mesh::Large);
        let moored = game.assign_boat(me, boat, None, current).is_ok();
        if !moored || game.assign_boat(me, boat, None, mesh).is_err() {
            return false;
        }
    }
    match zone {
        None => true,
        Some(zone) => game.assign_boat(me, boat, Some(zone), mesh).is_ok(),
    }
}

/// Every player boat back to the quay, with a journal line.
fn park_everything(game: &mut Game, why: &str) -> Vec<String> {
    for boat in player_boats(game) {
        let _ = set_boat(game, boat, None, Mesh::Large);
    }
    vec![format!("You keep the fleet at quay: {why}.")]
}

/// The bank that is slipping fastest in the journal: catch per trip over the
/// last week against the week before it, ties broken by the weaker trip, then
/// by zone order. A bank nobody fishes at all is not "threatened" here — the
/// steward has no observation on it, so it is simply left alone.
fn most_threatened(game: &Game) -> Option<Zone> {
    let mut scored: Vec<(u64, u64, usize)> = Vec::new();
    for zone in Zone::all() {
        if game.closed[zone.idx()] {
            continue;
        }
        let Some(recent) = window_cpt(game, zone, 0, STEWARD_WINDOW) else {
            continue;
        };
        let older = window_cpt(game, zone, STEWARD_WINDOW, STEWARD_WINDOW);
        let ratio = match older {
            Some(previous) if previous > 0 => recent.saturating_mul(10_000) / previous,
            _ => 10_000,
        };
        scored.push((ratio, recent, zone.idx()));
    }
    scored.sort_unstable();
    scored
        .first()
        .map(|(_, _, index)| Zone::all()[*index])
        .or_else(|| fallback_zone(game))
}

/// Catch per trip in tenths over a journal window, `skip` days back from the
/// last entry. `None` when nobody fished the zone in that window.
fn window_cpt(game: &Game, zone: Zone, skip: usize, take: usize) -> Option<u64> {
    let end = game.history.len().saturating_sub(skip);
    let start = end.saturating_sub(take);
    let (mut crates, mut trips) = (0u64, 0u64);
    for record in &game.history[start..end] {
        crates += record.crates[zone.idx()];
        trips += record.trips[zone.idx()];
    }
    (trips > 0).then(|| crates.saturating_mul(10) / trips)
}
