//! One harbour day: dawn orders, trips and auction, regrowth, wages, drain,
//! closures. Buyers close the evening they go broke; captains lay up Monday.

use crate::evening::{
    close_broke_buyers, drain_cannery, drain_fishmonger, drain_gull, pay_charges, regrow_all,
    settle_boundaries, spoil_closed,
};
use crate::{bots, fmt_gold, pay_rescuer, season, DayRecord, Game, CHANDLERY_MARGIN_BPS};
use rules::auction::{self, Lot, Outcome};
use rules::config::Config;
use rules::goldflow::{check_conservation, Flows};
use rules::state::{ActorId, Mesh, Species, Zone};
use serde::{Deserialize, Serialize};

/// One landing and its hammer price, with the net actually fished (B3).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Landing {
    pub captain: ActorId,
    pub boat: u64,
    pub zone: Zone,
    #[serde(default = "default_mesh")]
    pub mesh: Mesh,
    pub crates: u64,
    pub outcome: Outcome,
}

/// Old saves predate the landing mesh (B3): assume the large net.
fn default_mesh() -> Mesh {
    Mesh::Large
}

/// Everything one day did, for the ledger UI and the judges.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DayReport {
    pub day: u64,
    pub landings: Vec<Landing>,
    pub lines: Vec<String>,
    pub closures: Vec<ActorId>,
    pub gold_total: i64,
    pub flows: Flows,
    pub invariant_ok: bool,
    pub week_rolled: bool,
    pub council: Option<season::CouncilReport>,
    #[serde(default)]
    pub season_over: bool,
    #[serde(default)]
    pub bilan: Option<season::Bilan>,
}

/// What one tick did: one lot, or the whole evening that follows the last one.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TickReport {
    pub day: u64,
    /// True when this tick closed the day and the harbour is at the next dawn.
    pub closed: bool,
    /// The lot that landed on this tick, if any.
    pub landing: Option<Landing>,
    /// The evening's lines, only on the closing tick.
    pub lines: Vec<String>,
    /// The whole day, only on the closing tick.
    pub report: Option<DayReport>,
}

/// A day in progress: the journal line, the report being built, the flows.
/// Kept in the game so a browser tab can land one lot every thirty seconds
/// without losing the day it is in the middle of.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingDay {
    pub record: DayRecord,
    pub report: DayReport,
    pub flows: Flows,
    /// Port gold at dawn: the conservation baseline for the whole day, not
    /// for the last lot of it.
    #[serde(default)]
    pub gold_at_dawn: i64,
    /// The lots of the day, frozen at dawn: `(hull index, round)`. Never
    /// rebuilt from the fleet, so a hull that appears at noon sails no lot
    /// today and a round already closed stays closed. `None` only for a save
    /// written before the plan was stored; it is frozen on the first tick.
    #[serde(default)]
    pub plan: Option<Vec<(usize, u64)>>,
}

impl PendingDay {
    fn dawn(day: u64, gold: i64, plan: Vec<(usize, u64)>) -> Self {
        Self {
            gold_at_dawn: gold,
            record: DayRecord::new(day),
            report: DayReport::blank(day),
            flows: Flows::default(),
            plan: Some(plan),
        }
    }
}

impl DayReport {
    /// A report with nothing in it yet, for a day about to run.
    fn blank(day: u64) -> Self {
        Self {
            day,
            landings: Vec::new(),
            lines: Vec::new(),
            closures: Vec::new(),
            gold_total: 0,
            flows: Flows::default(),
            invariant_ok: false,
            week_rolled: false,
            council: None,
            season_over: false,
            bilan: None,
        }
    }
}

/// One harbour day through the season gate: an over game refuses with
/// "season over" instead of running (B5).
pub fn try_day(game: &mut Game) -> Result<DayReport, String> {
    if game.over {
        return Err("season over".to_string());
    }
    Ok(run_day(game))
}

/// One lot of the day through the season gate.
pub fn try_tick(game: &mut Game) -> Result<TickReport, String> {
    if game.over {
        return Err("season over".to_string());
    }
    Ok(tick(game))
}

/// One lot of the day, every thirty seconds in the live build.
///
/// Dawn orders run once, on the first lot, and the day's plan is frozen with
/// them: `boats x trips_per_boat_day` lots at dawn, round-major, exactly the
/// order a whole day used to run in. Landing one lot at a time changes the
/// rhythm, never the result. When the last lot is sold, the harbour settles
/// the evening.
pub fn tick(game: &mut Game) -> TickReport {
    let config = game.config.clone();
    if game.pending.is_none() {
        let plan = plan_from_fleet(game.port.boats.len(), config.trips_per_boat_day);
        game.pending = Some(PendingDay::dawn(game.port.day, game.gold_total(), plan));
        let orders = bots::decide_all(game);
        if let Some(pending) = game.pending.as_mut() {
            pending.report.lines.extend(orders);
        }
    }
    let (landed, plan_len) = plan_cursor(game, &config);
    let Some((index, _round)) = landed else {
        return close_day(game, None);
    };
    let mut landing = None;
    if let Some(pending) = game.pending.take() {
        let mut pending = pending;
        sail_boat(
            game,
            &config,
            &mut pending.record,
            &mut pending.report,
            &mut pending.flows,
            index,
        );
        landing = pending.report.landings.last().cloned();
        game.pending = Some(pending);
    }
    game.lots_landed += 1;
    if game.lots_landed as usize >= plan_len {
        // The last lot of the day lands and the harbour settles in the same
        // beat: five minutes of trading, then the evening.
        return close_day(game, landing);
    }
    TickReport {
        day: game.port.day,
        closed: false,
        landing,
        lines: Vec::new(),
        report: None,
    }
}

/// The plan of the day, as frozen at dawn: returns the lot under the cursor
/// and the plan's length. A save written before the plan was stored (no field)
/// freezes it now rather than losing the day.
fn plan_cursor(game: &mut Game, config: &Config) -> (Option<(usize, u64)>, usize) {
    let fleet = game.port.boats.len();
    let trips = config.trips_per_boat_day;
    let cursor = game.lots_landed as usize;
    match game.pending.as_mut() {
        None => (None, 0),
        Some(pending) => {
            let plan = pending
                .plan
                .get_or_insert_with(|| plan_from_fleet(fleet, trips));
            (plan.get(cursor).copied(), plan.len())
        }
    }
}

/// The lots of one day, in order: every hull once per round.
fn plan_from_fleet(fleet: usize, trips: u64) -> Vec<(usize, u64)> {
    let mut plan = Vec::with_capacity(fleet * trips as usize);
    for round in 0..trips {
        for index in 0..fleet {
            plan.push((index, round));
        }
    }
    plan
}

/// Credit every hull that sailed today to the captain who **sailed** her.
///
/// The landing log is the day's own record of who left the quay: reading the
/// owner of the hull slot at closing time credited the buyer of a hull seized
/// at noon with a trip the seller had already fished. A hull that sailed for
/// two captains counts once for each of them, and once per day only.
fn credit_boats_sailed(report: &DayReport, day: &mut DayRecord) {
    let mut credited: Vec<(u64, ActorId)> = Vec::new();
    for landing in &report.landings {
        let captain = landing.captain;
        if !captain.is_captain() || credited.contains(&(landing.boat, captain)) {
            continue;
        }
        credited.push((landing.boat, captain));
        day.boats_fished[captain.idx()] += 1;
    }
}

/// Close the day: regrowth, wages, the buyers' drain, bankruptcies, weeks and
/// seasons. This is the evening half of the day, unchanged by the clock.
fn close_day(game: &mut Game, landing: Option<Landing>) -> TickReport {
    let config = game.config.clone();
    let Some(mut pending) = game.pending.take() else {
        return TickReport { day: game.port.day, closed: true, landing, lines: Vec::new(), report: None };
    };
    let total_before = pending.gold_at_dawn;
    let mut day = std::mem::replace(&mut pending.record, DayRecord::new(game.port.day));
    let mut report = std::mem::replace(&mut pending.report, DayReport::blank(game.port.day));
    let mut flows = std::mem::replace(&mut pending.flows, Flows::default());
    credit_boats_sailed(&report, &mut day);
    regrow_all(game, &mut report);
    pay_charges(game, &mut report);
    drain_cannery(game, &mut report, &mut flows);
    drain_fishmonger(game, &mut report);
    drain_gull(game, &mut report, &mut flows);
    spoil_closed(game, &mut report);
    close_broke_buyers(game, &mut report);
    report.gold_total = game.gold_total();
    report.invariant_ok = check_conservation(total_before, report.gold_total, &flows);
    report.flows = flows.clone();
    game.flows_total.add_exports(flows.exports);
    game.flows_total.add_travellers(flows.travellers);
    game.flows_total.add_fuel_bait(flows.fuel_bait);
    day.gold_total = report.gold_total;
    game.history.push(day);
    game.port.day += 1;
    game.lots_landed = 0;
    for trips in game.port.trips_today.iter_mut() {
        *trips = 0;
    }
    settle_boundaries(game, &config, &mut report);
    game.last_report = Some(report.clone());
    TickReport {
        day: report.day,
        closed: true,
        landing,
        lines: report.lines.clone(),
        report: Some(report),
    }
}

/// Run one full day and advance the harbour to dawn: the fast path, used by
/// the CLI, the fast-forward and the tests. Same lots, same order, no clock.
pub fn run_day(game: &mut Game) -> DayReport {
    loop {
        let ticked = tick(game);
        if ticked.closed {
            if let Some(report) = ticked.report {
                return report;
            }
            break;
        }
    }
    // Unreachable in practice: a day always closes. Kept total for callers.
    DayReport {
        day: game.port.day,
        landings: Vec::new(),
        lines: Vec::new(),
        closures: Vec::new(),
        gold_total: game.gold_total(),
        flows: Flows::default(),
        invariant_ok: true,
        week_rolled: false,
        council: None,
        season_over: game.over,
        bilan: game.bilan.clone(),
    }
}

/// Sail one trip if the boat may, then sell the lot at once (TW-N-10..12).
fn sail_boat(
    game: &mut Game,
    config: &Config,
    day: &mut DayRecord,
    report: &mut DayReport,
    flows: &mut Flows,
    index: usize,
) {
    let boat = game.port.boats[index].clone();
    if !boat.owner.is_captain() {
        return;
    }
    let Some(zone) = boat.zone else {
        return;
    };
    if game.closed[zone.idx()] {
        return;
    }
    let owner = boat.owner.idx();
    if !rules::trips::can_sail(
        game.port.stopped[owner],
        game.port.trips_today[index],
        game.port.licences[owner],
        game.port.weekly_catch[owner],
        config,
    ) {
        return;
    }
    pay_trip_cost(game, config, flows, owner, zone);
    let mesh = if game.small_mesh_banned { Mesh::Large } else { boat.mesh };
    let landed = land_catch(game, config, zone, mesh, owner, index);
    day.trips[zone.idx()] += 1;
    day.crates[zone.idx()] += landed;
    day.captain_trips[owner] += 1;
    day.captain_crates[owner] += landed;
    if day.fished_zone[owner].is_none() {
        day.fished_zone[owner] = Some(zone);
    }
    if mesh == Mesh::Small {
        day.fished_mesh[owner] = Mesh::Small;
    }
    let meta = LandingMeta { captain: boat.owner, boat_id: boat.id, zone, mesh, crates: landed };
    sell_lot(game, config, day, report, &meta);
}

/// Trip cost to the chandlery; most of it leaves as fuel and bait imports.
fn pay_trip_cost(game: &mut Game, config: &Config, flows: &mut Flows, owner: usize, zone: Zone) {
    let cost = rules::trips::trip_cost(zone, config);
    let margin = cost * CHANDLERY_MARGIN_BPS / 10_000;
    game.port.gold[owner] -= cost as i64;
    game.port.gold[ActorId::Chandlery.idx()] += margin as i64;
    flows.add_fuel_bait(cost - margin);
}

/// Lift the catch out of the zone stock and count it towards quota and mesh.
fn land_catch(
    game: &mut Game,
    config: &Config,
    zone: Zone,
    mesh: Mesh,
    owner: usize,
    index: usize,
) -> u64 {
    let stock = game.port.stocks[zone.idx()];
    let base = rules::stocks::trip_catch(stock, config);
    let landed = rules::species::mesh_catch(base, mesh, config).min(stock);
    game.port.stocks[zone.idx()] -= landed;
    game.port.weekly_catch[owner] += landed;
    game.port.trips_today[index] += 1;
    game.week_total[zone.idx()] += landed;
    if mesh == Mesh::Small {
        game.week_small[zone.idx()] += landed;
    }
    landed
}

/// One landing on its way to the clock, with the net actually fished.
struct LandingMeta {
    captain: ActorId,
    boat_id: u64,
    zone: Zone,
    mesh: Mesh,
    crates: u64,
}

/// Sell one landing on the Dutch clock (TW-N-30..33).
fn sell_lot(
    game: &mut Game,
    config: &Config,
    day: &mut DayRecord,
    report: &mut DayReport,
    meta: &LandingMeta,
) {
    let species = Config::zone_species(meta.zone);
    let lot = Lot { species, crates: meta.crates };
    let buyers = bots::auction_buyers(game, species);
    let outcome = auction::clear(&lot, &buyers, config);
    match &outcome {
        Outcome::Sold { .. } => settle_sale(game, config, day, report, meta, species, &outcome),
        Outcome::Unsold { .. } => log_lost_lot(config, report, meta, species, &outcome),
    }
    report.landings.push(Landing {
        captain: meta.captain,
        boat: meta.boat_id,
        zone: meta.zone,
        mesh: meta.mesh,
        crates: meta.crates,
        outcome,
    });
}

/// Settle a sold lot: buyer pays and stores, captain earns, journal the line.
fn settle_sale(
    game: &mut Game,
    config: &Config,
    day: &mut DayRecord,
    report: &mut DayReport,
    meta: &LandingMeta,
    species: Species,
    outcome: &Outcome,
) {
    let Outcome::Sold { buyer, price, total } = outcome else {
        return;
    };
    let buyer_at = buyer.idx();
    let stock_before = game.port.stores[buyer_at][species.idx()];
    game.port.gold[buyer_at] -= *total as i64;
    game.port.stores[buyer_at][species.idx()] += meta.crates;
    game.port.gold[meta.captain.idx()] += *total as i64;
    day.gold_earned[meta.captain.idx()] += *total as i64;
    day.lot_price_sum += *price * meta.crates;
    day.lot_crates += meta.crates;
    if species == Species::Herring {
        day.add_herring_sale(*price, meta.crates);
    }
    pay_rescuer(game, meta.captain, *total);
    // Barreau 2: the landing levy, out of this sale and into the port fund.
    // One line per sold lot, so the ledger shows the price as it is paid.
    let levy = game.levy_on_sale(meta.captain, meta.crates, *total as i64);
    if levy > 0 {
        report.lines.push(format!(
            "Levy: {} on {} crates to the port fund.",
            fmt_gold(levy),
            meta.crates
        ));
    }
    let base = config.base_price(species);
    let target = config.buyer_target(*buyer, species);
    let factor = auction::stock_factor_bps(stock_before, target, config);
    report.lines.push(auction::sale_reasoning(
        buyer.name(),
        meta.crates,
        *price,
        base,
        factor,
        stock_before,
        target,
    ));
}

/// Journal a lot nobody takes above the floor: goods lost, no gold moved.
fn log_lost_lot(
    config: &Config,
    report: &mut DayReport,
    meta: &LandingMeta,
    species: Species,
    outcome: &Outcome,
) {
    let Outcome::Unsold { best_limit } = outcome else {
        return;
    };
    let base = config.base_price(species);
    let floor = auction::floor_price(base, config);
    report.lines.push(format!(
        "Lot lost: {} crates of {}, best limit {} below floor {}.",
        meta.crates,
        species.name(),
        rules::format_price(*best_limit),
        rules::format_price(floor)
    ));
}
