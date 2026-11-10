//! Rung 1, SEE: who takes what from each zone, against what the zone can
//! give back by itself.
//!
//! The register reads the journal (`DayRecord`), never a live lot: zone
//! crates over a window of days, the same window by captain, and the day's
//! logistic regrowth as the yardstick ([`sustainable_catch`]). Two readings
//! are written down here because they shape every number on the row:
//!
//! - `taken` always comes from the zone totals (`DayRecord::crates`), never
//!   from the captain column, so it is the port's own count;
//! - a captain is credited in the zone he fished *first* that day
//!   (`DayRecord::fished_zone`; the journal keeps no second zone). A two-zone
//!   day therefore credits all its crates to its first zone, and the captain
//!   column of a row can be smaller than `taken`. Shares are computed on the
//!   column, so they always add up to 10,000 bps.
//!
//! A captain laid up counts in `taken` (his crates were landed) but gets no
//! line of his own: the register names who still sails. The player is always
//! named, even laid up, because the point of the panel is what he himself did.

use crate::views::{actor_id, zone_id};
use crate::Game;
use rules::config::Config;
use rules::state::{ActorId, Zone};
use rules::stocks::sustainable_catch;
use serde_json::{json, Value};

/// Days the register observes by default; a shorter journal is read whole.
pub const ATTRIBUTION_WINDOW_DAYS: usize = 28;

/// One captain's take from a zone over the observed window.
struct Taker {
    actor: ActorId,
    crates: u64,
    /// Leftover of the exact share, for the largest-remainder rounding.
    remainder: u128,
    share_bps: u64,
}

impl Taker {
    /// Public shape of one line: slug, name, crates, share in bps.
    fn view(&self) -> Value {
        json!({
            "actor": actor_id(self.actor),
            "name": self.actor.name(),
            "crates": self.crates,
            "share_bps": self.share_bps,
        })
    }
}

/// The register: one row per zone, no filtering, empty on a fresh game.
pub fn attribution(game: &Game) -> Value {
    let days = window_days(game);
    Value::Array(Zone::all().iter().map(|zone| zone_row(game, *zone, days)).collect())
}

/// Observed window: the default 28 days, or all the journal there is.
fn window_days(game: &Game) -> usize {
    game.history.len().min(ATTRIBUTION_WINDOW_DAYS)
}

/// One zone's own figures, shared by the register (barreau 1) and the debt
/// (barreau 4) so the two panels can never disagree: the stock held today,
/// the capacity it grows back to, and the catch that leaves it where it is.
pub fn zone_ceiling(game: &Game, zone: Zone) -> (u64, u64, u64) {
    let index = zone.idx();
    let capacity = game.config.zone_capacity[index];
    let stock = game.port.stocks[index];
    let rate = game.config.regrow_rate(Config::zone_species(zone));
    (stock, capacity, sustainable_catch(stock, capacity, rate))
}

/// One zone row: the ceiling, the take, the ratio, and who took it.
fn zone_row(game: &Game, zone: Zone, days: usize) -> Value {
    let index = zone.idx();
    let (stock, capacity, sustainable) = zone_ceiling(game, zone);
    let taken: u64 = game.recent(days).iter().map(|record| record.crates[index]).sum();
    let takers = takers(game, zone, days);
    json!({
        "zone": zone_id(zone),
        "stock": stock,
        "capacity": capacity,
        "sustainable": sustainable,
        "window_days": days,
        "captains": takers.iter().map(Taker::view).collect::<Vec<_>>(),
        "taken": taken,
        "over_bps": over_bps(taken, sustainable, days),
    })
}

/// Captains named on a row, biggest take first, shares in bps.
fn takers(game: &Game, zone: Zone, days: usize) -> Vec<Taker> {
    let mut listed: Vec<Taker> = ActorId::captains()
        .iter()
        .filter(|actor| listed(game, **actor))
        .map(|actor| Taker {
            actor: *actor,
            crates: credited(game, *actor, zone, days),
            remainder: 0,
            share_bps: 0,
        })
        .filter(|taker| taker.crates > 0)
        .collect();
    listed.sort_by(|a, b| b.crates.cmp(&a.crates).then(a.actor.idx().cmp(&b.actor.idx())));
    let column: u64 = listed.iter().map(|taker| taker.crates).sum();
    allocate_shares(&mut listed, column);
    listed
}

/// The player always gets a line; an NPC only while he still sails.
fn listed(game: &Game, actor: ActorId) -> bool {
    actor == ActorId::You || !game.port.stopped[actor.idx()]
}

/// Crates a captain is credited with in a zone over the window.
fn credited(game: &Game, actor: ActorId, zone: Zone, days: usize) -> u64 {
    game.recent(days)
        .iter()
        .filter(|record| record.fished_zone[actor.idx()] == Some(zone))
        .map(|record| record.captain_crates[actor.idx()])
        .sum()
}

/// Parts of `total` in bps by largest remainder, so they add to exactly
/// 10,000: floors first, then one point each to the biggest leftovers.
fn allocate_shares(takers: &mut [Taker], total: u64) {
    if total == 0 {
        return;
    }
    let total = total as u128;
    let mut assigned = 0u64;
    for taker in takers.iter_mut() {
        let exact = taker.crates as u128 * 10_000;
        taker.share_bps = (exact / total) as u64;
        taker.remainder = exact % total;
        assigned += taker.share_bps;
    }
    let mut left = 10_000u64.saturating_sub(assigned);
    let mut order: Vec<usize> = (0..takers.len()).collect();
    order.sort_by(|a, b| takers[*b].remainder.cmp(&takers[*a].remainder));
    for index in order {
        if left == 0 {
            break;
        }
        takers[index].share_bps += 1;
        left -= 1;
    }
}

/// Take against the sustainable catch of the whole window, in bps: 18,000
/// means 1.8 x the ceiling. Undefined when the zone can give nothing back
/// (full or empty sea): the register writes 0 and the panel says "capital".
fn over_bps(taken: u64, sustainable: u64, days: usize) -> u64 {
    let ceiling = sustainable as u128 * days as u128;
    if ceiling == 0 {
        return 0;
    }
    (taken as u128 * 10_000 / ceiling).min(u64::MAX as u128) as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{seed_game, DayRecord};

    /// One day on the journal: a zone and the captains who fished it.
    fn day(game: &mut Game, zone: Zone, takes: &[(ActorId, u64)]) {
        let mut record = DayRecord::new(game.history.len() as u64);
        for (captain, crates) in takes {
            record.captain_crates[captain.idx()] += crates;
            record.crates[zone.idx()] += crates;
            record.fished_zone[captain.idx()] = Some(zone);
        }
        game.history.push(record);
    }

    /// A seeded game with no journal yet and Greybank set to `stock`.
    fn game_on(stock: u64) -> Game {
        let mut game = seed_game(7);
        game.history.clear();
        game.port.stocks[Zone::Greybank.idx()] = stock;
        game
    }

    /// The row of one zone in the register.
    fn row(game: &Game, slug: &str) -> Value {
        attribution(game)
            .as_array()
            .expect("rows")
            .iter()
            .find(|row| row["zone"] == slug)
            .cloned()
            .expect("zone row")
    }

    /// The three rows always come in the zone order the UI reads.
    #[test]
    fn a_fresh_game_has_three_empty_rows() {
        let game = game_on(5000);
        let rows = attribution(&game);
        let rows = rows.as_array().expect("rows");
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0]["zone"], "shallows");
        assert_eq!(rows[1]["zone"], "greybank");
        assert_eq!(rows[2]["zone"], "deeps");
        assert_eq!(rows[1]["window_days"], 0);
        assert_eq!(rows[1]["taken"], 0);
        assert_eq!(rows[1]["over_bps"], 0);
        assert!(rows[1]["captains"].as_array().expect("captains").is_empty());
    }

    /// Two captains on one zone: parts add to 10,000 and rank by crates.
    #[test]
    fn two_captains_split_the_zone_at_ten_thousand_bps() {
        let mut game = game_on(2500);
        day(&mut game, Zone::Greybank, &[(ActorId::You, 1800), (ActorId::Brandt, 1200)]);
        let row = row(&game, "greybank");
        let captains = row["captains"].as_array().expect("captains");
        assert_eq!(captains.len(), 2);
        assert_eq!(row["taken"], 3000);
        assert_eq!(captains[0]["actor"], "you");
        assert_eq!(captains[0]["share_bps"], 6000);
        assert_eq!(captains[1]["actor"], "brandt");
        assert_eq!(captains[1]["share_bps"], 4000);
        assert!(captains[0]["share_bps"].as_u64() > captains[1]["share_bps"].as_u64());
        let sum: u64 = captains.iter().filter_map(|c| c["share_bps"].as_u64()).sum();
        assert_eq!(sum, 10_000);
    }

    /// The (stock, capacity, rate) of the row is the ceiling, and the ratio
    /// follows the take: over 10,000 when drawing down, under when light.
    #[test]
    fn over_bps_reads_heavy_and_light_seasons() {
        // Greybank is herring: 7% a day, capacity 5,000. At 2,500 crates the
        // ceiling is 87 crates a day.
        let mut heavy = game_on(2500);
        for _ in 0..28 {
            day(&mut heavy, Zone::Greybank, &[(ActorId::You, 100)]);
        }
        let heavy_row = row(&heavy, "greybank");
        assert_eq!(heavy_row["stock"], 2500);
        assert_eq!(heavy_row["capacity"], 5000);
        assert_eq!(heavy_row["sustainable"], 87);
        assert_eq!(heavy_row["window_days"], 28);
        assert_eq!(heavy_row["taken"], 2800);
        assert!(heavy_row["over_bps"].as_u64().expect("bps") > 10_000);

        let mut light = game_on(2500);
        for _ in 0..28 {
            day(&mut light, Zone::Greybank, &[(ActorId::You, 10)]);
        }
        let light_row = row(&light, "greybank");
        assert_eq!(light_row["taken"], 280);
        assert!(light_row["over_bps"].as_u64().expect("bps") < 10_000);
    }

    /// A laid-up NPC keeps his crates in `taken` but loses his line; the
    /// player keeps his line even laid up.
    #[test]
    fn a_stopped_captain_is_not_named() {
        let mut game = game_on(2500);
        game.port.stopped[ActorId::Okoro.idx()] = true;
        game.port.stopped[ActorId::You.idx()] = true;
        day(&mut game, Zone::Greybank, &[(ActorId::You, 400), (ActorId::Okoro, 600)]);
        let row = row(&game, "greybank");
        assert_eq!(row["taken"], 1000);
        let actors: Vec<String> = row["captains"]
            .as_array()
            .expect("captains")
            .iter()
            .map(|c| c["actor"].as_str().unwrap_or_default().to_string())
            .collect();
        assert_eq!(actors, vec!["you".to_string()]);
        assert_eq!(row["captains"][0]["share_bps"], 10_000);
    }

    /// A journal shorter than the window is read whole, not padded with
    /// empty days.
    #[test]
    fn a_short_journal_reads_only_the_days_there_are() {
        let mut game = game_on(2500);
        for _ in 0..5 {
            day(&mut game, Zone::Greybank, &[(ActorId::You, 20)]);
        }
        let row = row(&game, "greybank");
        assert_eq!(row["window_days"], 5);
        assert_eq!(row["taken"], 100);
        // 87 crates a day x 5 days = 435: 100 taken is under a quarter of it.
        assert_eq!(row["over_bps"], 2_298);
    }

    /// Thirty days on the journal: the window keeps the last 28 only.
    #[test]
    fn a_long_journal_is_clipped_to_the_window() {
        let mut game = game_on(2500);
        for _ in 0..30 {
            day(&mut game, Zone::Greybank, &[(ActorId::You, 10)]);
        }
        let row = row(&game, "greybank");
        assert_eq!(row["window_days"], 28);
        assert_eq!(row["taken"], 280);
    }

    /// Three equal takers: the largest remainder hands the odd point out and
    /// the parts still add to exactly 10,000.
    #[test]
    fn shares_add_to_exactly_ten_thousand() {
        let mut game = game_on(2500);
        day(
            &mut game,
            Zone::Greybank,
            &[(ActorId::You, 1), (ActorId::Hale, 1), (ActorId::Brandt, 1)],
        );
        let row = row(&game, "greybank");
        let shares: Vec<u64> = row["captains"]
            .as_array()
            .expect("captains")
            .iter()
            .filter_map(|c| c["share_bps"].as_u64())
            .collect();
        assert_eq!(shares, vec![3_334, 3_333, 3_333]);
        assert_eq!(shares.iter().sum::<u64>(), 10_000);
    }
}
