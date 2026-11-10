//! The evening half of a harbour day: regrowth, wages, the buyers' drain,
//! bankruptcies, and the week and season boundaries behind them.
//!
//! Split from [`cycle`](crate::cycle) so each file stays readable; the tick that
//! lands the lots lives there, the settlement lives here.

use crate::cycle::DayReport;
use crate::{
    fmt_gold, pay_rescuer, season, Game, CANNERY_WAGES_PER_DAY, EXPORT_PRESERVE_MULT_BPS,
    TRAVELLER_MULT_BPS,
};
use rules::bankruptcy::{broke_buyers, close_buyer};
use rules::state::Zone;
use rules::config::Config;
use rules::goldflow::Flows;
use rules::state::{ActorId, Species};

/// Week and season boundaries once the day counter has advanced: Monday
/// settlement first, then the season-end council, then the bilan (B5).
pub(crate) fn settle_boundaries(game: &mut Game, config: &Config, report: &mut DayReport) {
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

pub(crate) fn regrow_all(game: &mut Game, report: &mut DayReport) {
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
pub(crate) fn pay_charges(game: &mut Game, report: &mut DayReport) {
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
pub(crate) fn drain_cannery(game: &mut Game, report: &mut DayReport, flows: &mut Flows) {
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
pub(crate) fn drain_fishmonger(game: &mut Game, report: &mut DayReport) {
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
pub(crate) fn drain_gull(game: &mut Game, report: &mut DayReport, flows: &mut Flows) {
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
pub(crate) fn spoil_closed(game: &mut Game, report: &mut DayReport) {
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
pub(crate) fn close_broke_buyers(game: &mut Game, report: &mut DayReport) {
    for buyer in broke_buyers(&game.port) {
        close_buyer(&mut game.port, buyer);
        report.closures.push(buyer);
        report.lines.push(format!("{} closes its doors (broke).", buyer.name()));
    }
}
