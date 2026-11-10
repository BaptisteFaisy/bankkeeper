//! Player views: the live game projected into relay JSON.
//!
//! The relay serves these verbatim to the web UI (`sim state|graph|judges`
//! print them). Gold crosses as whole pieces with one decimal (5040
//! centigold -> 50.4), matching the brief display lines. The player never
//! sees a real stock here (TW-C1-01): zones show catch per trip and trend.

use crate::cycle::Landing;
use crate::merchant_views::buyer_limits;
use crate::fastforward::{DayPoint, FfEvent};
use crate::Game;
use rules::auction::Outcome;
use rules::config::Config;
use rules::state::{ActorId, Zone};
use rules::survey::{is_valid, trend, Trend};
use rules::trips::quota_left;
use serde_json::{json, Value};

/// Rung 1 (SEE): who took what, per zone, against the sustainable catch.
pub use crate::attribution::attribution;

/// Slugs, colours and gold formatting: pure renderings, kept in one module.
pub use crate::labels::{
    actor_id, boat_name, captain_color, gold_pieces, mesh_id, tide, trend_id, weekday, zone_id,
};

/// Latest catch per trip in a zone, from the journal (TW-C1-02 display).
fn zone_catch_per_trip(game: &Game, zone: Zone) -> u64 {
    let Some(last) = game.history.last() else {
        return 0;
    };
    let trips = last.trips[zone.idx()];
    last.crates[zone.idx()].checked_div(trips).unwrap_or(0)
}

/// Catch trend: last week against the week before, in tenths per trip.
fn zone_trend(game: &Game, zone: Zone) -> Trend {
    let recent = game.recent(14);
    if recent.len() < 8 {
        return Trend::Steady;
    }
    let (older, newer) = recent.split_at(recent.len() - 7);
    trend(week_cpt_tenths(newer, zone), week_cpt_tenths(older, zone))
}

/// Mean catch per trip in tenths over journal entries, for one zone.
fn week_cpt_tenths(records: &[crate::DayRecord], zone: Zone) -> u64 {
    let mut crates = 0u64;
    let mut trips = 0u64;
    for record in records {
        crates += record.crates[zone.idx()];
        trips += record.trips[zone.idx()];
    }
    crates.saturating_mul(10).checked_div(trips).unwrap_or(0)
}

/// Fresh survey reading for a zone, if the player holds one (TW-C1-03).
fn zone_survey(game: &Game, zone: Zone) -> Option<String> {
    let survey = game.surveys.iter().find(|kept| kept.zone == zone)?;
    if !is_valid(survey.day, game.port.day, &game.config) {
        return None;
    }
    Some(format!("~{} crates", rules::format_crates(survey.estimate)))
}

/// One zone card: catch signal and trend, never the real stock (TW-C1-01).
fn zone_view(game: &Game, zone: Zone) -> Value {
    let capacity = game.config.zone_capacity[zone.idx()];
    let stock = game.port.stocks[zone.idx()];
    let schools = stock.saturating_mul(4).checked_div(capacity).unwrap_or(0).min(4);
    let boats = game.port.boats.iter().filter(|boat| boat.zone == Some(zone)).count();
    json!({
        "id": zone_id(zone),
        "catchPerTrip": zone_catch_per_trip(game, zone),
        "trend": trend_id(zone_trend(game, zone)),
        "tripCost": gold_pieces(game.config.zone_trip_cost[zone.idx()] as i64),
        "schools": schools,
        "boats": boats,
        "survey": zone_survey(game, zone),
    })
}

/// One hull: orders, net, last catch, disarmed when its captain is laid up.
fn boat_view(game: &Game, index: usize) -> Value {
    let boat = &game.port.boats[index];
    json!({
        "id": boat.id.to_string(),
        "name": boat_name(boat.id),
        "captain": boat.owner.name(),
        "mine": boat.owner == ActorId::You,
        "zone": boat.zone.map(zone_id),
        "mesh": mesh_id(boat.mesh),
        "trip": Value::Null,
        "lastCatch": last_catch(game, boat.id),
        "disarmed": game.port.stopped[boat.owner.idx()],
    })
}

/// "16 crates" for a hull that landed yesterday, "—" otherwise.
fn last_catch(game: &Game, boat_id: u64) -> String {
    let landed = game
        .last_report
        .as_ref()
        .map(|report| {
            report.landings.iter().filter(|landed| landed.boat == boat_id).map(|landed| landed.crates).sum::<u64>()
        })
        .unwrap_or(0);
    if landed == 0 {
        "—".to_string()
    } else {
        format!("{landed} crates")
    }
}

/// One captain card for the chart legend and the judges table.
fn captain_view(game: &Game, captain: ActorId) -> Value {
    json!({
        "id": actor_id(captain),
        "name": captain.name(),
        "color": captain_color(captain),
        "gold": gold_pieces(game.port.gold[captain.idx()]),
        "licences": game.port.licences[captain.idx()],
        "ownedLicences": game.owned_licences(captain),
        "quotaCrates": game.quota_crates(captain),
        "active": !game.port.stopped[captain.idx()],
    })
}

/// One buyer card: openness, stores, diet. No live lot exists (the clock
/// clears each landing at once), so the live limit is always null.
fn buyer_view(game: &Game, buyer: ActorId) -> Value {
    let targets = game.config.buyer_targets[buyer.idx()];
    json!({
        "limits": buyer_limits(game, buyer),
        "id": actor_id(buyer),
        "name": buyer.name(),
        "open": !game.port.stopped[buyer.idx()],
        "limit": Value::Null,
        "stock": game.port.stores[buyer.idx()].iter().sum::<u64>(),
        "target": targets.iter().sum::<u64>(),
        "buys": buyer_diet(targets),
    })
}

/// "herring", "cod", or "herring + cod" from the buyer targets.
fn buyer_diet(targets: [u64; 2]) -> &'static str {
    match (targets[0] > 0, targets[1] > 0) {
        (true, true) => "herring + cod",
        (true, false) => "herring",
        (false, true) => "cod",
        (false, false) => "nothing",
    }
}

/// Yesterday's landings for the ledger, oldest first.
/// The lines of the day being played, else of the last closed day.
fn current_lines(game: &Game) -> Vec<String> {
    if let Some(pending) = game.pending.as_ref() {
        if !pending.report.lines.is_empty() {
            return pending.report.lines.clone();
        }
    }
    game.last_report.as_ref().map(|report| report.lines.clone()).unwrap_or_default()
}

fn landing_views(game: &Game) -> Vec<Value> {
    // A day in progress owns the landings of the day: in the live build the
    // evening has not happened yet, and the panel must still show the lots.
    if let Some(pending) = game.pending.as_ref() {
        return pending
            .report
            .landings
            .iter()
            .map(|landing| landing_view(game, landing))
            .collect();
    }
    game.last_report
        .as_ref()
        .map(|report| report.landings.iter().map(|landing| landing_view(game, landing)).collect())
        .unwrap_or_default()
}

/// One landing: captain, crates, species, hammer price, buyer, net fished.
fn landing_view(game: &Game, landing: &Landing) -> Value {
    let species = Config::zone_species(landing.zone);
    let (buyer, price, total) = match &landing.outcome {
        Outcome::Sold { buyer, price, total } => (
            Some(buyer.name()),
            gold_pieces(*price as i64),
            gold_pieces(*total as i64),
        ),
        Outcome::Unsold { .. } => (None, 0.0, 0.0),
    };
    json!({
        "captain": landing.captain.name(),
        "crates": landing.crates,
        "species": species.name(),
        "price": price,
        "total": total,
        "buyer": buyer,
        "start": gold_pieces(game.config.clock_start(species) as i64),
        "mesh": mesh_id(landing.mesh),
    })
}

/// Auction panel: no live lot, plus the last hammer fall and its line.
fn auction_view(game: &Game) -> Value {
    let sale = game.last_report.as_ref().and_then(|report| {
        report.landings.iter().enumerate().rev().find_map(|(lot, landing)| match &landing.outcome {
            Outcome::Sold { buyer, price, total } => Some(json!({
                "lot": lot,
                "buyer": buyer.name(),
                "crates": landing.crates,
                "price": gold_pieces(*price as i64),
                "total": gold_pieces(*total as i64),
                "reasoning": last_sold_line(&report.lines),
            })),
            Outcome::Unsold { .. } => None,
        })
    });
    json!({
        "lot": Value::Null,
        "clock": 0.0,
        "floor": 0.0,
        "start": 0.0,
        "lastSale": sale,
        "reasoning": sold_reasoning(game),
    })
}

/// Last "Sold to ..." journal line, or "" before the first hammer fall.
fn sold_reasoning(game: &Game) -> String {
    game.last_report.as_ref().map(|report| last_sold_line(&report.lines)).unwrap_or_default()
}

/// Last sale line in a journal, or "" when nothing sold yet.
fn last_sold_line(lines: &[String]) -> String {
    lines.iter().rev().find(|line| line.starts_with("Sold to")).cloned().unwrap_or_default()
}

/// Net worth reading: purse plus licences at the going price plus hulls at
/// the seizure-auction price.
fn net_worth(game: &Game, captain: ActorId) -> i64 {
    let hulls = game.boats_of(captain).len() as i64 * crate::SEIZED_BOAT_PRICE as i64;
    let paper = game.owned_licences(captain) as i64 * game.licence_price_now() as i64;
    game.port.gold[captain.idx()] + paper + hulls
}

/// Full player view for GET /api/state (matches web PortState).
pub fn view_state(game: &Game) -> Value {
    let held = game.port.licences[ActorId::You.idx()];
    json!({
        "week": game.port.week(&game.config) + 1,
        "day": weekday(game.port.day),
        "tide": tide(game.port.day),
        "seed": game.port.seed.to_string(),
        "seasonDays": game.config.days_per_week * game.config.weeks_per_season,
        "weeksPerSeason": game.config.weeks_per_season,
        "playerGold": gold_pieces(game.port.gold[ActorId::You.idx()]),
        "netWorth": gold_pieces(net_worth(game, ActorId::You)),
        "licencePrice": gold_pieces(game.licence_price_now() as i64),
        "quotaLeft": quota_left(held, game.port.weekly_catch[ActorId::You.idx()], &game.config),
        "licences": held,
        "zones": Zone::all().iter().map(|zone| zone_view(game, *zone)).collect::<Vec<_>>(),
        "boats": (0..game.port.boats.len()).map(|index| boat_view(game, index)).collect::<Vec<_>>(),
        "captains": ActorId::captains().iter().map(|captain| captain_view(game, *captain)).collect::<Vec<_>>(),
        "buyers": ActorId::buyers().iter().map(|buyer| buyer_view(game, *buyer)).collect::<Vec<_>>(),
        "auction": auction_view(game),
        "landings": landing_views(game),
        "reasoning": current_lines(game),
        "season": displayed_season(game),
        "secondsPerLot": game.config.seconds_per_lot,
        "lotsLeft": lots_left(game),
        "campaignSeasons": game.config.campaign_seasons,
        "campaignOver": closed_seasons(game) >= game.config.campaign_seasons,
        "campaign": game.campaign,
        "chronicle": game.chronicle,
        "charter": game.charter,
        "seasonOver": game.over,
        "bilan": game.bilan,
        "lastCouncil": game.last_council,
        "leases": game.leases.iter().map(|lease| json!({"lessor": actor_id(lease.lessor), "lessorName": lease.lessor.name(), "lessee": actor_id(lease.lessee), "lesseeName": lease.lessee.name(), "weeklyRent": gold_pieces(lease.weekly_rent as i64), "weeksLeft": lease.weeks_left})).collect::<Vec<_>>(),
        "attribution": attribution(game),
        "favours": crate::favours::favours_view(game),
        "levyPerCrate": gold_pieces(game.config.levy_per_crate as i64),
        "fund": crate::fund::fund_view(game),
        "council": crate::govern::council_view(game),
        "sea": crate::sea::sea_view(game),
        "dispute": crate::dispute::dispute_view(game),
    })
}

/// Lots still to land today: the plan minus the cursor.
fn lots_left(game: &Game) -> u64 {
    let trips = game.config.trips_per_boat_day;
    let total = trips.saturating_mul(game.port.boats.len() as u64);
    total.saturating_sub(game.lots_landed)
}

/// Season number as the player reads it: the one being played, or the one
/// whose bilan is on screen.
fn displayed_season(game: &Game) -> u64 {
    if game.over {
        // The closed season the bilan and the chronicle both name.
        crate::chronicle::chronicle_season(game)
    } else {
        game.port.season(&game.config) + 1
    }
}

/// Seasons already closed, counting the one waiting on its bilan screen.
fn closed_seasons(game: &Game) -> u64 {
    game.campaign.len() as u64 + u64::from(game.over)
}

/// Stock and price series for GET /api/graph (TW-J-02).
pub fn view_graph(game: &Game) -> Value {
    let history: Vec<Value> = game
        .history
        .iter()
        .map(|record| {
            json!({
                "day": record.day,
                "crates": record.crates,
                "trips": record.trips,
                "herring_price": record.herring_price,
            })
        })
        .collect();
    json!({
        "history": history,
        "stocks": game.port.stocks,
        "capacity": game.config.zone_capacity,
    })
}

/// One loan note for the judges table: borrower, holder, arrears (TW-C3-05).
fn loan_view(game: &Game, index: usize) -> Value {
    let loan = &game.loans[index];
    json!({
        "id": loan.id,
        "borrower": loan.borrower.name(),
        "holder": loan.holder.name(),
        "outstanding": gold_pieces(loan.outstanding as i64),
        "missed": loan.missed,
    })
}

/// Judges table for GET /api/judges: purses, licences, gold circuit (TW-J-03).
pub fn view_judges(game: &Game) -> Value {
    let actors: Vec<Value> = ActorId::all()
        .iter()
        .map(|actor| {
            json!({
                "id": actor_id(*actor),
                "name": actor.name(),
                "gold": gold_pieces(game.port.gold[actor.idx()]),
                "licences": game.port.licences[actor.idx()],
                "stopped": game.port.stopped[actor.idx()],
            })
        })
        .collect();
    let loans: Vec<Value> =
        (0..game.loans.len()).map(|index| loan_view(game, index)).collect();
    json!({
        "seed": game.port.seed,
        "day": game.port.day,
        "week": game.port.week(&game.config) + 1,
        "actors": actors,
        "gold_total": gold_pieces(game.gold_total()),
        "ext_in": gold_pieces((game.flows_total.exports + game.flows_total.travellers) as i64),
        "ext_out": gold_pieces((game.flows_total.fuel_bait + game.flows_total.reseed) as i64),
        "licence_pool": game.port.licence_pool,
        "proposal": game.proposal,
        "loans": loans,
        "fund": crate::fund::fund_view(game),
        "dispute": crate::dispute::dispute_view(game),
    })
}

/// Columnar graph series from a fast-forward run, for --series.
pub fn ff_series(history: &[DayPoint]) -> Value {
    json!({
        "days": history.iter().map(|p| p.day).collect::<Vec<_>>(),
        "stocks": history.iter().map(|p| p.stocks).collect::<Vec<_>>(),
        "herring_price": history.iter().map(|p| p.herring_price).collect::<Vec<_>>(),
        "gold_total": history.iter().map(|p| p.gold_total).collect::<Vec<_>>(),
    })
}

/// Graph markers from a fast-forward journal: closures and seizures only.
pub fn ff_markers(events: &[FfEvent]) -> Value {
    let markers: Vec<Value> = events.iter().filter(|e| e.kind == "closure" || e.kind == "seizure")
        .map(|e| json!({"day": e.day, "kind": e.kind, "detail": e.detail})).collect();
    Value::Array(markers)
}

#[cfg(test)]
#[path = "views_tests.rs"]
mod tests;
