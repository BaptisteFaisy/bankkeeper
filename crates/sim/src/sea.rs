//! Barreau 4 — Hériter : the debt the season leaves the sea.
//!
//! [`crate::attribution`] already reads, zone by zone, what the port took and
//! what the zone could give back ([`crate::attribution::zone_ceiling`]). This
//! module turns the gap into a liability the **campaign** carries:
//!
//! 1. **Accrual, once a season.** [`accrue`] runs at [`crate::season::close_season`]:
//!    each zone owes `taken - ceiling x days` crates ([`rules::sea::season_debt`]),
//!    and the sum is added to [`Game::sea_debt`]. Nothing is charged twice.
//! 2. **Fallow pays it.** [`Game::pay_in_fallow`] closes a zone for a number of
//!    weeks and credits the regrowth the sea performs meanwhile
//!    ([`rules::sea::fallow_credit`]). No gold moves: the cost is the revenue
//!    the closed zone would have paid, which the game already charges.
//! 3. **Reseeding pays it.** [`Game::pay_in_reseed`] has the port fund buy
//!    juveniles abroad ([`rules::sea::reseed_cost`]), puts the crates back in
//!    the zone and writes the gold off the port as an outside purchase.
//!
//! The debt is carried in crates because that is the unit the player reads;
//! it is converted to gold only on the day it is actually paid.

use crate::attribution::zone_ceiling;
use crate::{fmt_gold, Game};
use rules::sea::{reseed_cost, season_debt};
use rules::state::Zone;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// What one season left the sea, zone by zone, in crates.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SeaBill {
    /// Crates taken this season, per zone.
    pub taken: [u64; 3],
    /// Crates the zone could give back by itself, per day.
    pub ceiling: [u64; 3],
    /// What this season alone owes, per zone.
    pub zones: [u64; 3],
    /// The season's debt: the sum of the three rows.
    pub total: u64,
    /// The campaign's liability once this season is written down.
    pub carried: u64,
}

/// Days a season lasts, the window the bill is read over.
pub fn season_days(game: &Game) -> u64 {
    game.config.days_per_week * game.config.weeks_per_season
}

/// The days the register reads: the season being played, or — once the
/// council has sat — the season it just closed.
///
/// The journal holds one record a day and the calendar turns on the season
/// length, so the season in progress is the tail of the journal. A season
/// that has opened but not yet played reads zero days: nothing taken, no
/// bill. Reading the window this way is what keeps a season from being
/// counted twice — the one the council has just written down is already
/// inside [`Game::sea_debt`].
fn season_window(game: &Game) -> u64 {
    let days = season_days(game);
    if game.over {
        return days;
    }
    game.port.day % days
}

/// What the season just played owes the sea, without writing anything down.
/// A fresh game owes nothing: no journal, no bill.
pub fn season_bill(game: &Game) -> SeaBill {
    bill_over(game, season_days(game))
}

/// The bill of the season the register is reading: the one being played, or
/// the one the council has just closed.
pub fn window_bill(game: &Game) -> SeaBill {
    bill_over(game, season_window(game))
}

/// The bill over the last `days` days of the journal: the crates taken from
/// each zone, against what that zone could give back over the same days.
/// The window's length is the yardstick, so a bill read over a fortnight is
/// measured against a fortnight of regrowth.
fn bill_over(game: &Game, days: u64) -> SeaBill {
    let mut bill = SeaBill { taken: [0; 3], ceiling: [0; 3], zones: [0; 3], total: 0, carried: game.sea_debt };
    let window = game.recent(days as usize);
    for zone in Zone::all() {
        let index = zone.idx();
        let (_, _, ceiling) = zone_ceiling(game, zone);
        let taken: u64 = window.iter().map(|record| record.crates[index]).sum();
        bill.taken[index] = taken;
        bill.ceiling[index] = ceiling;
        bill.zones[index] = season_debt(taken, ceiling, days);
        bill.total = bill.total.saturating_add(bill.zones[index]);
    }
    bill.carried = game.sea_debt.saturating_add(bill.total);
    bill
}

/// Write the season's bill down: the campaign's liability grows by it. Called
/// once, from [`crate::season::close_season`], so no day can bill twice.
pub fn accrue(game: &mut Game) -> SeaBill {
    let bill = season_bill(game);
    game.sea_debt = bill.carried;
    bill
}

/// The fund pays for `crates` of juveniles put back into `zone`. Returns the
/// gold spent; refuses a dry fund, a debt smaller than the reseed, or a zone
/// already at its capacity.
fn reseed_from_fund(game: &mut Game, zone: Zone, crates: u64) -> Result<u64, String> {
    let index = zone.idx();
    let price = game.last_week_crate_price().unwrap_or(game.config.base_herring);
    let gold = reseed_cost(crates, price);
    if gold == 0 {
        return Err("a reseed costs something: no price, no purchase".to_string());
    }
    let (stock, capacity, _) = zone_ceiling(game, zone);
    if stock.saturating_add(crates) > capacity {
        return Err(format!(
            "{} holds {stock} of {capacity} crates: reseeding {crates} would spill over",
            zone.name()
        ));
    }
    if game.fund.balance < gold as i64 {
        return Err(format!(
            "the port fund holds {}, the reseed costs {}",
            fmt_gold(game.fund.balance),
            fmt_gold(gold as i64)
        ));
    }
    game.fund.balance -= gold as i64;
    game.fund.paid_out += gold;
    game.port.stocks[index] += crates;
    game.flows_total.add_reseed(gold);
    game.sea_debt = game.sea_debt.saturating_sub(crates);
    Ok(gold)
}

impl Game {
    /// Pay part of the debt by resting a zone: `weeks` of closure, credited
    /// with the regrowth the sea performs ([`rules::sea::fallow_credit`]).
    /// Returns the crates paid off.
    pub fn pay_in_fallow(&mut self, zone: Zone, weeks: u64) -> Result<u64, String> {
        if weeks == 0 {
            return Err("a fallow lasts at least one week".to_string());
        }
        if self.sea_debt == 0 {
            return Err("the sea is owed nothing: no fallow needed".to_string());
        }
        let credit = fallow_credit_for(self, zone, weeks);
        if credit == 0 {
            return Err(format!("{} grows nothing: resting it pays no debt", zone.name()));
        }
        let paid = credit.min(self.sea_debt);
        self.sea_debt -= paid;
        self.fallow[zone.idx()] = self.fallow[zone.idx()].saturating_add(weeks);
        self.closed[zone.idx()] = true;
        Ok(paid)
    }

    /// Pay part of the debt by reseeding a zone out of the port fund. Returns
    /// the gold spent; the crates go back into the sea, the debt comes down.
    pub fn pay_in_reseed(&mut self, zone: Zone, crates: u64) -> Result<u64, String> {
        if crates == 0 {
            return Err("a reseed puts at least one crate back".to_string());
        }
        if self.sea_debt == 0 {
            return Err("the sea is owed nothing: no reseed needed".to_string());
        }
        let crates = crates.min(self.sea_debt);
        reseed_from_fund(self, zone, crates)
    }

    /// Weeks of fallow still to run, per zone.
    pub fn fallow_left(&self, zone: Zone) -> u64 {
        self.fallow[zone.idx()]
    }

    /// One week of every fallow passes: the counter comes down and the zone
    /// stays closed while any week remains.
    pub(crate) fn run_fallow_week(&mut self) -> Vec<String> {
        let mut lines = Vec::new();
        for zone in Zone::all() {
            let index = zone.idx();
            if self.fallow[index] == 0 {
                continue;
            }
            self.fallow[index] -= 1;
            if self.fallow[index] == 0 {
                self.closed[index] = false;
                lines.push(format!("{} opens again: the fallow is over.", zone.name()));
            } else {
                self.closed[index] = true;
                lines.push(format!(
                    "{} rests: {} week(s) of fallow left.",
                    zone.name(),
                    self.fallow[index]
                ));
            }
        }
        lines
    }
}

/// What a fallow of `weeks` on `zone` pays the debt, in crates: the regrowth
/// the resting zone performs over those days. One reading, shared by the
/// payment (barreau 4) and the panel that announces it.
pub fn fallow_credit_for(game: &Game, zone: Zone, weeks: u64) -> u64 {
    let (stock, capacity, _) = zone_ceiling(game, zone);
    let rate = game.config.regrow_rate(rules::config::Config::zone_species(zone));
    let days = weeks.saturating_mul(game.config.days_per_week);
    rules::sea::fallow_credit(stock, capacity, rate, days)
}

/// The sea block of the state: the bill, the liability and the two ways out.
///
/// `debt` is what the campaign owes and can pay — the liability the councils
/// have written down. `season` is the bill of the season the register is
/// reading: the one being played (still running up) or the one the council
/// has just closed (already written down, so never counted twice).
pub fn sea_view(game: &Game) -> Value {
    let bill = window_bill(game);
    let price = game.last_week_crate_price().unwrap_or(game.config.base_herring);
    let pending = !game.over && season_window(game) > 0;
    json!({
        "debt": game.sea_debt,
        "season": bill.total,
        "pending": pending,
        "zones": Zone::all().iter().map(|zone| json!({
            "zone": crate::views::zone_id(*zone),
            "taken": bill.taken[zone.idx()],
            "ceiling": bill.ceiling[zone.idx()],
            "debt": bill.zones[zone.idx()],
            "fallowWeeks": game.fallow_left(*zone),
            // What one week of rest would pay the debt, in crates: the
            // regrowth the closed zone performs (the same figure the debt
            // is paid with, so the panel never promises what the engine
            // will not pay).
            "fallowCredit": fallow_credit_for(game, *zone, 1),
        })).collect::<Vec<_>>(),
        "reseedPrice": crate::views::gold_pieces(price as i64),
        "reseedGold": crate::views::gold_pieces(reseed_cost(1, price) as i64),
        // What the port fund holds, in gold pieces: the reseed is paid from
        // it, so the panel can say what it would cost before the click.
        "fundBalance": crate::views::gold_pieces(game.fund.balance),
    })
}
