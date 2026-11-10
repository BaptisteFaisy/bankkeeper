//! Tidewater day-cycle engine: the harbour lives one day at a time.
//!
//! [`Game`] wraps the shared [`Harbour`](rules::state::Harbour) core with the
//! sim-owned layer books (loans, mesh pressure, bailouts, surveys), the
//! pending council motion, and the daily journal the NPCs read. One day is
//! [`cycle::run_day`]; weeks and seasons settle in [`season`]; judges
//! fast-forward through [`fastforward`]. Same seed + same orders = same season.

pub mod attribution;
pub mod bots;
pub mod charter;
pub mod chronicle;
pub mod cli;
pub mod cycle;
mod day_record;
pub mod dispute;
mod evening;
pub mod favours;
pub mod fastforward;
pub mod fleet;
pub mod fund;
pub mod govern;
pub mod harness;
pub mod labels;
pub mod policies;
mod reading;
mod merchant_views;
pub mod relay;
pub mod sea;
pub mod season;
pub mod seed;
pub mod views;

pub use day_record::DayRecord;
pub use fund::Fund;
pub use seed::{draw, draw_below, seed_game, seed_game_with, Rng};

use rules::bankruptcy::{bailout_owed, bailout_payout};
use rules::config::Config;
use rules::council::{licence_price, Proposal};
use rules::debt::{transfer_note, Loan};
use rules::goldflow::Flows;
use rules::species::MeshLedger;
use rules::state::{ActorId, Harbour, Mesh, Zone};
use rules::survey::{buy_estimate, Survey};
use serde::{Deserialize, Serialize};

/// Cannery preserves sell abroad at 1.5x the herring base (TW-N-40 inflow).
/// Sim reading: the rules crate prices the auction, the sim prices the drain.
pub const EXPORT_PRESERVE_MULT_BPS: u64 = 15_000;
/// Inn travellers pay 1.5x the cod base (TW-N-40 inflow).
pub const TRAVELLER_MULT_BPS: u64 = 15_000;
/// Share of trip revenue the chandlery keeps; the rest leaves the port as
/// imported fuel and bait (TW-N-40 outflow).
pub const CHANDLERY_MARGIN_BPS: u64 = 2_500;
/// Cannery payroll to townsfolk per open day, in centigold (60 gold).
pub const CANNERY_WAGES_PER_DAY: u64 = 6_000;
/// Used-boat price at seizure auctions, in centigold (200 gold).
pub const SEIZED_BOAT_PRICE: u64 = 20_000;
/// First loan-note token id handed out by the sim (brief section 6: 100+).
pub const FIRST_LOAN_ID: u64 = 100;

/// Centigold shown with one decimal: 5040 -> "50.4", -120 -> "-1.2".
pub fn fmt_gold(cents: i64) -> String {
    let sign = if cents < 0 { "-" } else { "" };
    format!("{sign}{}", rules::format_price(cents.unsigned_abs()))
}

/// Catch-per-trip tenths shown with one decimal: 98 -> "9.8".
pub fn fmt_tenths(tenths: u64) -> String {
    format!("{}.{}", tenths / 10, tenths % 10)
}

/// One actor rescued by another (TW-N-52): the investor takes a cut of every
/// profit until 150% of the rescue gold is repaid.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Bailout {
    pub actor: ActorId,
    pub investor: ActorId,
    pub invested: u64,
    pub repaid: u64,
}

impl Bailout {
    /// Gold still owed to the investor.
    pub fn owed(&self, config: &Config) -> u64 {
        bailout_owed(self.invested, config).saturating_sub(self.repaid)
    }
}

/// Full sim state: shared core plus layer books plus journal. Serializable so
/// the relay can persist it as JSON.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Game {
    pub config: Config,
    pub port: Harbour,
    pub loans: Vec<Loan>,
    pub mesh: MeshLedger,
    pub bailouts: Vec<Bailout>,
    pub surveys: Vec<Survey>,
    /// Each captain's moral book with the player (see [`favours`]).
    #[serde(default)]
    pub favours: Vec<favours::Favour>,
    /// Player motion for the next council; None means status quo.
    pub proposal: Option<Proposal>,
    /// Player ballot on the pending motion; None backs it (own motion).
    pub player_vote: Option<bool>,
    /// Yesterday's landings and reasoning lines, for the ledger UI.
    pub last_report: Option<cycle::DayReport>,
    pub closed: [bool; 3],
    pub small_mesh_banned: bool,
    /// This week's small-mesh and total crates per zone (mesh ledger input).
    pub week_small: [u64; 3],
    pub week_total: [u64; 3],
    /// Cumulative outside flows (TW-J-03 judges panel).
    pub flows_total: Flows,
    pub history: Vec<DayRecord>,
    pub next_loan_id: u64,
    pub next_boat_id: u64,
    /// Season over after the end-of-season council + bilan (B5).
    #[serde(default)]
    pub over: bool,
    #[serde(default)]
    pub bilan: Option<season::Bilan>,
    /// Last council report, so minutes survive a reload (B5 follow-up).
    #[serde(default)]
    pub last_council: Option<season::CouncilReport>,
    /// Bilan of every closed season, oldest first: the campaign log.
    #[serde(default)]
    pub campaign: Vec<season::Bilan>,
    /// The port's public memory: one entry per closed season, oldest first.
    #[serde(default)]
    pub chronicle: Vec<chronicle::ChronicleEntry>,
    /// The charter this campaign runs under, if the player wrote one.
    #[serde(default)]
    pub charter: Option<charter::Charter>,
    /// The day in progress, when the build lands one lot at a time.
    #[serde(default)]
    pub pending: Option<cycle::PendingDay>,
    /// Lots already landed today: the cursor into the day's plan.
    #[serde(default)]
    pub lots_landed: u64,
    /// Licence leases in force (TW-N-24): one record per licence lent out.
    #[serde(default)]
    pub leases: Vec<rules::licences::Lease>,
    /// The port fund: levy in, repairs out (barreau 2).
    #[serde(default)]
    pub fund: Fund,
    /// The indemnity a carried motion still owes, paid on Mondays (barreau 3).
    #[serde(default)]
    pub payroll: Option<govern::Payroll>,
    /// Barreau 4: the crates the campaign owes the sea, carried from season to
    /// season until fallow or reseeding pays them down.
    #[serde(default)]
    pub sea_debt: u64,
    /// Barreau 4: weeks of fallow still to run, per zone. A zone rests while
    /// its counter is above zero and is closed to every boat meanwhile.
    #[serde(default)]
    pub fallow: [u64; 3],
    /// Barreau 5: claims against the port fund filed this season (max 1 per season).
    #[serde(default)]
    pub claims_this_season: u64,
    /// Barreau 5: the closure the council voted (zone, weeks). A claim must
    /// rest on a voted rule, never on a rest a captain imposed on himself.
    #[serde(default)]
    pub voted_closure: Option<(rules::state::Zone, u64)>,
    /// Barreau 5: credibility of the player / proposer (affects council admission and votes).
    #[serde(default)]
    pub credibility: i32,
    /// Barreau 5: last claim filed against the port fund, kept for the ledger view.
    #[serde(default)]
    pub last_claim: Option<rules::dispute::Claim>,
    /// Barreau 5: total gold paid out in collective fallow indemnities.
    #[serde(default)]
    pub fallow_indemnities_paid: u64,
}

impl Game {
    /// Boat indices owned by an actor, in fleet order.
    pub fn boats_of(&self, owner: ActorId) -> Vec<usize> {
        self.port.boats.iter().enumerate()
            .filter(|(_, boat)| boat.owner == owner).map(|(index, _)| index).collect()
    }

    /// Total gold in the port (TW-N-42 conservation input, fund included).
    pub fn gold_total(&self) -> i64 {
        self.port.total_gold() + self.fund.balance
    }

    /// Licences a captain fishes with this week: its own, minus those lent
    /// out, plus those rented in. The day cycle reads the same number from
    /// `port.licences`, so the lessee really lands the lessor's quota.
    pub fn quota_licences(&self, actor: ActorId) -> u64 {
        self.port.licences[actor.idx()]
    }

    /// Weekly landing quota of a captain, leases included (TW-N-24).
    pub fn quota_crates(&self, actor: ActorId) -> u64 {
        rules::licences::weekly_quota(self.quota_licences(actor), &self.config)
    }

    /// Licences a captain owns: fishing rights plus those lent out, minus
    /// those rented in. A lease moves the quota, never the property, so the
    /// 8-licence ceiling and the council vote read this count.
    pub fn owned_licences(&self, actor: ActorId) -> u64 {
        rules::licences::owned_licences(self.port.licences[actor.idx()], &self.leases, actor)
    }

    /// Last `days` journal entries (fewer at season start).
    pub fn recent(&self, days: usize) -> &[DayRecord] {
        let skip = self.history.len().saturating_sub(days);
        &self.history[skip..]
    }

    /// Crates-weighted average lot price over the last 7 days, if any lots
    /// sold. Feeds the licence price (TW-C4-04).
    pub fn last_week_crate_price(&self) -> Option<u64> {
        let mut sum = 0u128;
        let mut crates = 0u128;
        for record in self.recent(7) {
            sum += record.lot_price_sum as u128;
            crates += record.lot_crates as u128;
        }
        sum.checked_div(crates).map(|avg| avg as u64)
    }

    /// Current licence price: expected weekly yield, or the fallback before
    /// any sale (TW-C4-04).
    pub fn licence_price_now(&self) -> u64 {
        match self.last_week_crate_price() {
            Some(expected) => licence_price(expected, self.config.quota_per_licence),
            None => self.config.base_licence_price,
        }
    }

    /// Assign a boat to a zone (None = quay) with a net. Mesh switches only
    /// at quay (TW-C2-02); closed zones and banned small mesh are refused.
    pub fn assign_boat(
        &mut self,
        captain: ActorId,
        boat_id: u64,
        zone: Option<Zone>,
        mesh: Mesh,
    ) -> Result<(), String> {
        if self.port.stopped[captain.idx()] {
            return Err(format!("{} is laid up", captain.name()));
        }
        let boat = self
            .port
            .boats
            .iter_mut()
            .find(|boat| boat.id == boat_id && boat.owner == captain)
            .ok_or_else(|| format!("boat {boat_id} is not yours"))?;
        if let Some(zone) = zone {
            if self.closed[zone.idx()] {
                return Err(format!("{} is closed by the council", zone.name()));
            }
        }
        if mesh == Mesh::Small && self.small_mesh_banned {
            return Err("small mesh is banned by the council".to_string());
        }
        if boat.zone.is_some() && boat.mesh != mesh {
            return Err("nets are switched at quay only".to_string());
        }
        boat.zone = zone;
        boat.mesh = mesh;
        Ok(())
    }

    /// Buy a one-zone survey: 80 gold to the townsfolk soundings crew, frozen
    /// estimate good for a week (TW-C1-03).
    pub fn buy_survey(&mut self, actor: ActorId, zone: Zone) -> Result<Survey, String> {
        let cost = self.config.survey_cost;
        let purse = self.port.gold[actor.idx()];
        if purse < cost as i64 {
            return Err(format!(
                "survey costs {}, {} holds {}",
                fmt_gold(cost as i64),
                actor.name(),
                fmt_gold(purse)
            ));
        }
        self.port.gold[actor.idx()] -= cost as i64;
        self.port.gold[ActorId::Townsfolk.idx()] += cost as i64;
        let survey = Survey {
            zone,
            day: self.port.day,
            estimate: buy_estimate(
                self.port.stock(zone),
                self.port.seed,
                self.port.day,
                zone,
                &self.config,
            ),
        };
        self.surveys.retain(|kept| kept.zone != zone);
        self.surveys.push(survey);
        Ok(survey)
    }

    /// Table a council motion for the next season end (TW-C4-03).
    pub fn propose(&mut self, proposal: Proposal) {
        self.proposal = Some(proposal);
    }

    /// Refloat a laid-up captain or closed buyer (TW-N-52). The rescuer pays
    /// into the purse and takes a profit share until 150% is repaid.
    pub fn refloat(
        &mut self,
        investor: ActorId,
        actor: ActorId,
        amount: u64,
    ) -> Result<(), String> {
        if investor == actor {
            return Err("cannot rescue yourself".to_string());
        }
        if !actor.is_captain() && !actor.is_buyer() {
            return Err(format!("{} never stops", actor.name()));
        }
        if !self.port.stopped[actor.idx()] {
            return Err(format!("{} is still going", actor.name()));
        }
        if amount == 0 {
            return Err("rescue gold must be positive".to_string());
        }
        let purse = self.port.gold[investor.idx()];
        if purse < amount as i64 {
            return Err(format!(
                "{} holds {}, needs {}",
                investor.name(),
                fmt_gold(purse),
                fmt_gold(amount as i64)
            ));
        }
        self.port.gold[investor.idx()] -= amount as i64;
        self.port.gold[actor.idx()] += amount as i64;
        self.port.stopped[actor.idx()] = false;
        self.bailouts.push(Bailout {
            actor,
            investor,
            invested: amount,
            repaid: 0,
        });
        if investor == ActorId::You {
            let reason = format!("You put {} back on its feet.", actor.name());
            self.record_favour(actor, favours::REFLOAT, &reason);
        }
        Ok(())
    }

    /// Buy a loan note from its holder at face value (TW-C3-05).
    pub fn buy_note(&mut self, buyer: ActorId, loan_id: u64) -> Result<(), String> {
        let loan = self
            .loans
            .iter_mut()
            .find(|loan| loan.id == loan_id)
            .ok_or_else(|| format!("no loan {loan_id}"))?;
        if loan.holder == buyer {
            return Err("you already hold that note".to_string());
        }
        let price = rules::debt::note_price(loan.outstanding);
        let purse = self.port.gold[buyer.idx()];
        if purse < price as i64 {
            return Err(format!(
                "note costs {}, {} holds {}",
                fmt_gold(price as i64),
                buyer.name(),
                fmt_gold(purse)
            ));
        }
        self.port.gold[buyer.idx()] -= price as i64;
        self.port.gold[loan.holder.idx()] += price as i64;
        transfer_note(loan, buyer);
        Ok(())
    }

    /// Forgive the arrears on a held note: the next miss counts as the first
    /// again (TW-C3-05 report).
    pub fn defer_loan(&mut self, holder: ActorId, loan_id: u64) -> Result<(), String> {
        let loan = self
            .loans
            .iter_mut()
            .find(|loan| loan.id == loan_id)
            .ok_or_else(|| format!("no loan {loan_id}"))?;
        if loan.holder != holder {
            return Err("only the note holder grants a delay".to_string());
        }
        loan.missed = 0;
        let borrower = loan.borrower;
        if holder == ActorId::You {
            let reason = format!("You gave {} time on his note.", borrower.name());
            self.record_favour(borrower, favours::DEFER, &reason);
        }
        Ok(())
    }

}

/// Pay the rescuer its cut of one profit, if any (TW-N-52).
pub(crate) fn pay_rescuer(game: &mut Game, actor: ActorId, profit: u64) {
    let config = game.config.clone();
    let Some(bailout) = game.bailouts.iter_mut().find(|b| b.actor == actor) else {
        return;
    };
    let pay = bailout_payout(profit, bailout.owed(&config), &config);
    if pay == 0 {
        return;
    }
    let pay = pay.min(game.port.gold[actor.idx()].max(0) as u64);
    if pay == 0 {
        return;
    }
    game.port.gold[actor.idx()] -= pay as i64;
    game.port.gold[bailout.investor.idx()] += pay as i64;
    bailout.repaid += pay;
}
