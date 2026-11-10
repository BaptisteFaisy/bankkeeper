//! One harbour day: dawn orders, trips and auction, regrowth, wages, drain,
//! closures. Buyers close the evening they go broke; captains lay up Monday.

use crate::{
    bots, fmt_gold, pay_rescuer, season, DayRecord, Game, CANNERY_WAGES_PER_DAY,
    CHANDLERY_MARGIN_BPS, EXPORT_PRESERVE_MULT_BPS, TRAVELLER_MULT_BPS,
};
use rules::auction::{self, Lot, Outcome};
use rules::bankruptcy::{broke_buyers, close_buyer};
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

/// One harbour day through the season gate: an over game refuses with
/// "season over" instead of running (B5).
pub fn try_day(game: &mut Game) -> Result<DayReport, String> {
    if game.over {
        return Err("season over".to_string());
    }
    Ok(run_day(game))
}

/// Run one full day and advance the harbour to dawn.
pub fn run_day(game: &mut Game) -> DayReport {
    let config = game.config.clone();
    let total_before = game.gold_total();
    let mut day = DayRecord::new(game.port.day);
    let mut flows = Flows::default();
    let mut report = DayReport {
        day: game.port.day,
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
    };
    report.lines.extend(bots::decide_all(game));
    run_trips(game, &config, &mut day, &mut report, &mut flows);
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
    for trips in game.port.trips_today.iter_mut() {
        *trips = 0;
    }
    settle_boundaries(game, &config, &mut report);
    game.last_report = Some(report.clone());
    report
}

/// Week and season boundaries once the day counter has advanced: Monday
/// settlement first, then the season-end council, then the bilan (B5).
fn settle_boundaries(game: &mut Game, config: &Config, report: &mut DayReport) {
    if game.port.day.is_multiple_of(config.days_per_week) {
        report.week_rolled = true;
        let mut closures = Vec::new();
        report.lines.extend(season::roll_week(game, &mut closures));
        report.closures.extend(closures);
    }
    let season_days = config.days_per_week * config.weeks_per_season;
    if game.port.day.is_multiple_of(season_days) {
        report.council = Some(season::roll_season(game));
        game.last_council = report.council.clone();
        season::close_season(game, report);
    }
}

/// Sail every round of the day, then count the boats that fished per captain.
fn run_trips(
    game: &mut Game,
    config: &Config,
    day: &mut DayRecord,
    report: &mut DayReport,
    flows: &mut Flows,
) {
    for _ in 0..config.trips_per_boat_day {
        for index in 0..game.port.boats.len() {
            sail_boat(game, config, day, report, flows, index);
        }
    }
    for index in 0..game.port.boats.len() {
        if game.port.trips_today[index] > 0 {
            let owner = game.port.boats[index].owner;
            if owner.is_captain() {
                day.boats_fished[owner.idx()] += 1;
            }
        }
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

/// Overnight regrowth on every zone (TW-N-03, TW-C2-01, TW-C2-03).
fn regrow_all(game: &mut Game, report: &mut DayReport) {
    let greybank = game.port.stocks[Zone::Greybank.idx()];
    for zone in Zone::all() {
        let species = Config::zone_species(zone);
        let capacity = if zone == Zone::Deeps {
            rules::species::cod_capacity(greybank, &game.config)
        } else {
            game.config.zone_capacity[zone.idx()]
        };
        let rate = game.config.regrow_rate(species);
        let effective =
            rules::species::effective_regrow_rate(rate, game.mesh.share_bps(zone), &game.config);
        let grown = rules::stocks::regrow(game.port.stocks[zone.idx()], capacity, effective);
        game.port.stocks[zone.idx()] += grown;
        report.lines.push(format!("{} regrows {grown} crates.", zone.name()));
    }
}

/// Daily crew wages, at sea or at quay (TW-C3-01). Laid-up boats carry no crew.
fn pay_charges(game: &mut Game, report: &mut DayReport) {
    for captain in ActorId::captains() {
        if game.port.stopped[captain.idx()] {
            continue;
        }
        let boats = game.boats_of(captain).len() as u64;
        let due = rules::debt::daily_charges(boats, &game.config);
        game.port.gold[captain.idx()] -= due as i64;
        game.port.gold[ActorId::Townsfolk.idx()] += due as i64;
        let wages = fmt_gold(due as i64);
        report.lines.push(format!("{} pays {wages} in crew wages.", captain.name()));
    }
}

/// Cannery: export every herring crate as preserves, then pay the workers.
/// Fresh fish clears nightly (sim readings, see the crate root constants).
fn drain_cannery(game: &mut Game, report: &mut DayReport, flows: &mut Flows) {
    if game.port.stopped[ActorId::Cannery.idx()] {
        return;
    }
    let crates = game.port.stores[ActorId::Cannery.idx()][Species::Herring.idx()];
    game.port.stores[ActorId::Cannery.idx()][Species::Herring.idx()] = 0;
    let revenue = (crates as u128 * game.config.base_herring as u128 * EXPORT_PRESERVE_MULT_BPS as u128 / 10_000).min(u64::MAX as u128) as u64;
    game.port.gold[ActorId::Cannery.idx()] += revenue as i64;
    flows.add_exports(revenue);
    pay_rescuer(game, ActorId::Cannery, revenue);
    game.port.gold[ActorId::Cannery.idx()] -= CANNERY_WAGES_PER_DAY as i64;
    game.port.gold[ActorId::Townsfolk.idx()] += CANNERY_WAGES_PER_DAY as i64;
    report.lines.push(format!(
        "Cannery exports {crates} crates of preserves for {}.",
        fmt_gold(revenue as i64)
    ));
}

/// Crates the townsfolk can still buy at `base` with tonight's purse.
fn townsfolk_afford(game: &Game, base: u64) -> u64 {
    game.port.gold[ActorId::Townsfolk.idx()].max(0) as u64 / base
}

/// Sell one species to the townsfolk at base price; returns (sold, unsold).
fn serve_species(game: &mut Game, buyer: ActorId, species: Species) -> (u64, u64) {
    let store = game.port.stores[buyer.idx()][species.idx()];
    let base = game.config.base_price(species);
    let sold = store.min(townsfolk_afford(game, base));
    game.port.gold[ActorId::Townsfolk.idx()] -= (sold * base) as i64;
    game.port.gold[buyer.idx()] += (sold * base) as i64;
    game.port.stores[buyer.idx()][species.idx()] = 0;
    (sold, store - sold)
}

/// Fishmonger: serve the townsfolk while they can pay; the rest spoils.
fn drain_fishmonger(game: &mut Game, report: &mut DayReport) {
    if game.port.stopped[ActorId::Fishmonger.idx()] {
        return;
    }
    let mut sold = 0u64;
    let mut revenue = 0u64;
    let mut spoiled = 0u64;
    for species in [Species::Herring, Species::Cod] {
        let (crates, rest) = serve_species(game, ActorId::Fishmonger, species);
        sold += crates;
        revenue += crates * game.config.base_price(species);
        spoiled += rest;
    }
    pay_rescuer(game, ActorId::Fishmonger, revenue);
    report.lines.push(format!(
        "Fishmonger serves {sold} crates to the townsfolk for {} ({spoiled} spoiled).",
        fmt_gold(revenue as i64)
    ));
}

/// The Gull: locals first at base price, the rest to travellers at 1.5x.
fn drain_gull(game: &mut Game, report: &mut DayReport, flows: &mut Flows) {
    if game.port.stopped[ActorId::Gull.idx()] {
        return;
    }
    let base = game.config.base_cod;
    let (locals, travellers) = serve_species(game, ActorId::Gull, Species::Cod);
    let local_revenue = locals * base;
    let travel_revenue = (travellers as u128 * base as u128 * TRAVELLER_MULT_BPS as u128 / 10_000).min(u64::MAX as u128) as u64;
    game.port.gold[ActorId::Townsfolk.idx()] -= local_revenue as i64;
    game.port.gold[ActorId::Gull.idx()] += (local_revenue + travel_revenue) as i64;
    flows.add_travellers(travel_revenue);
    pay_rescuer(game, ActorId::Gull, local_revenue + travel_revenue);
    report.lines.push(format!(
        "The Gull serves {locals} crates to locals and {travellers} to travellers for {}.",
        fmt_gold((local_revenue + travel_revenue) as i64)
    ));
}

/// Closed buyers stop trading; their perishable stores spoil.
fn spoil_closed(game: &mut Game, report: &mut DayReport) {
    for buyer in ActorId::buyers() {
        if !game.port.stopped[buyer.idx()] {
            continue;
        }
        let crates: u64 = game.port.stores[buyer.idx()].iter().sum();
        game.port.stores[buyer.idx()] = [0; 2];
        if crates > 0 {
            report.lines.push(format!(
                "{} stores spoil ({crates} crates, closed).",
                buyer.name()
            ));
        }
    }
}

/// Broke buyers close the same evening (TW-N-51).
fn close_broke_buyers(game: &mut Game, report: &mut DayReport) {
    for buyer in broke_buyers(&game.port) {
        close_buyer(&mut game.port, buyer);
        report.closures.push(buyer);
        report.lines.push(format!("{} closes its doors (broke).", buyer.name()));
    }
}
