//! Barreau 5 — Réparer : the collective fallow and the claim against the fund.
//!
//! Two collective exits, and nothing else:
//!
//! 1. **The collective fallow**: the council votes to close a zone for N weeks.
//!    Fishing stops, the sea regrows, and the port fund compensates the captains
//!    penalized by the closure. Single implementation: shares [`Game::close_zone_for`]
//!    with the individual fallow of barreau 4.
//! 2. **The claim against the fund**: a captain penalized by a rule can file a claim
//!    against the port fund. Exactly **one claim per season, no more**. A won claim
//!    is paid out of the fund (gold conserved); a lost claim costs credibility, which
//!    bends future council votes and motion admission.
//!
//! Numbers only, no sermons.

use crate::attribution::zone_ceiling;
use crate::{fmt_gold, Game};
use rules::dispute::{adjudicate_claim, settle_payment, Claim, ClaimOutcome, MAX_CLAIMS_PER_SEASON};
use rules::state::{ActorId, Zone};
use serde_json::{json, Value};

/// Weekly loss in centigold for a captain who was fishing `zone`.
/// Based on his average weekly catch in that zone over recent history.
pub fn captain_zone_loss(game: &Game, captain: ActorId, zone: Zone) -> u64 {
    let days = game.history.len().min(28);
    if days == 0 {
        return 0;
    }
    let crates_in_zone: u64 = game
        .recent(days)
        .iter()
        .filter(|r| r.fished_zone[captain.idx()] == Some(zone))
        .map(|r| r.captain_crates[captain.idx()])
        .sum();
    let price = game.last_week_crate_price().unwrap_or(game.config.base_herring);
    let weeks = (days as u64).max(7) / 7;
    (crates_in_zone / weeks).saturating_mul(price)
}

/// Calculate the proven loss of a captain under standing rules.
/// A captain who fished a voted closed zone or whose quota was cut without indemnity
/// has suffered measurable economic harm recorded in the journal.
pub fn calculate_proven_loss(game: &Game, captain: ActorId) -> u64 {
    let mut total_loss = 0u64;
    // Loss from a voted closed zone where the captain fished: a claim lies
    // only against a rule the council voted, never against voluntary fallow.
    if let Some((voted_zone, _)) = game.voted_closure {
        if game.closed[voted_zone.idx()] || game.fallow_left(voted_zone) > 0 {
            total_loss = total_loss.saturating_add(captain_zone_loss(game, captain, voted_zone));
        }
    }
    // Loss from quota below standard (70) without adequate indemnity
    if game.config.quota_per_licence < 70 {
        let licences = game.owned_licences(captain);
        let lost_crates = (70 - game.config.quota_per_licence).saturating_mul(licences);
        let price = game.last_week_crate_price().unwrap_or(game.config.base_herring);
        total_loss = total_loss.saturating_add(lost_crates.saturating_mul(price));
    }
    total_loss
}

impl Game {
    /// Unified zone closure: sets fallow counter, marks closed, returns boats to quay.
    /// Used by both individual fallow (`pay_in_fallow`) and collective fallow (`apply_proposal`).
    pub fn close_zone_for(&mut self, zone: Zone, weeks: u64) -> u64 {
        let index = zone.idx();
        self.fallow[index] = self.fallow[index].saturating_add(weeks);
        self.closed[index] = true;
        for boat in self.port.boats.iter_mut().filter(|b| b.zone == Some(zone)) {
            boat.zone = None;
        }
        self.fallow[index]
    }

    /// Compensate captains penalized by a collective fallow out of the port fund.
    /// Each captain who historically fished the closed zone receives an indemnity
    /// proportioned to his proven weekly loss, paid from the port fund.
    pub fn compensate_fallow(&mut self, zone: Zone, weeks: u64, lines: &mut Vec<String>) -> u64 {
        let mut total_paid = 0u64;
        let price = self.last_week_crate_price().unwrap_or(self.config.base_herring);
        let (_, _, ceiling) = zone_ceiling(self, zone);
        let weekly_budget = ceiling.saturating_mul(7).saturating_mul(price);

        for captain in ActorId::captains() {
            if self.port.stopped[captain.idx()] {
                continue;
            }
            let loss = captain_zone_loss(self, captain, zone).saturating_mul(weeks);
            if loss == 0 {
                continue;
            }
            let share = loss.min(weekly_budget.saturating_mul(weeks));
            let payable = share.min(self.fund.balance.max(0) as u64);
            if payable > 0 {
                self.fund.balance -= payable as i64;
                self.fund.paid_out += payable;
                self.port.gold[captain.idx()] += payable as i64;
                self.fallow_indemnities_paid = self.fallow_indemnities_paid.saturating_add(payable);
                total_paid = total_paid.saturating_add(payable);
                lines.push(format!(
                    "Port fund pays {} to {}: {} collective fallow indemnity.",
                    fmt_gold(payable as i64),
                    captain.name(),
                    zone.name()
                ));
            }
        }
        total_paid
    }

    /// File a claim against the port fund. Exactly ONE claim admitted per season.
    /// Upheld: fund pays plaintiff, gold conserved.
    /// Dismissed: plaintiff loses credibility, penalizing future council motions.
    pub fn file_claim(&mut self, plaintiff: ActorId, demanded: u64) -> Result<Claim, String> {
        if self.claims_this_season >= MAX_CLAIMS_PER_SEASON {
            return Err("one claim per season, no more".to_string());
        }
        if demanded == 0 {
            return Err("a claim must demand a positive amount".to_string());
        }
        let season = self.port.season(&self.config) + 1;
        let proven_loss = calculate_proven_loss(self, plaintiff);
        let verdict = adjudicate_claim(proven_loss, demanded);
        let (paid, unpaid) = settle_payment(verdict.due, self.fund.balance);
        self.apply_claim_payout(plaintiff, paid, verdict.credibility_delta);
        self.claims_this_season += 1;
        let summary = format_claim_summary(plaintiff, demanded, verdict.outcome, paid, unpaid, verdict.credibility_delta);
        let claim = Claim { season, plaintiff, demanded, outcome: verdict.outcome, paid, unpaid, credibility_delta: verdict.credibility_delta, summary };
        self.last_claim = Some(claim.clone());
        Ok(claim)
    }

    /// Move gold from fund to plaintiff and apply credibility impact.
    fn apply_claim_payout(&mut self, plaintiff: ActorId, paid: u64, delta: i32) {
        if paid > 0 {
            self.fund.balance -= paid as i64;
            self.fund.paid_out += paid;
            self.port.gold[plaintiff.idx()] += paid as i64;
        }
        if delta != 0 {
            for other in ActorId::captains() {
                if other != plaintiff && other != ActorId::You {
                    self.record_favour(other, delta, "An unfounded claim was dismissed by the council.");
                }
            }
            if plaintiff == ActorId::You {
                self.credibility = self.credibility.saturating_add(delta);
            }
        }
    }
}

/// Factual claim sentence for the ledger: numbers, no sermon.
fn format_claim_summary(plaintiff: ActorId, demanded: u64, outcome: ClaimOutcome, paid: u64, unpaid: u64, delta: i32) -> String {
    match outcome {
        ClaimOutcome::Upheld if unpaid > 0 => format!(
            "Claim of {} by {}: upheld; {} paid by fund, {} stays owed.",
            fmt_gold(demanded as i64), plaintiff.name(), fmt_gold(paid as i64), fmt_gold(unpaid as i64)
        ),
        ClaimOutcome::Upheld => format!(
            "Claim of {} by {}: settled for {} paid by the port fund.",
            fmt_gold(demanded as i64), plaintiff.name(), fmt_gold(paid as i64)
        ),
        ClaimOutcome::Dismissed => format!(
            "Claim of {} by {}: dismissed; credibility falls by {}.",
            fmt_gold(demanded as i64), plaintiff.name(), delta.abs()
        ),
    }
}

/// Register and state view for barreau 5.
pub fn dispute_view(game: &Game) -> Value {
    let claim_view = game.last_claim.as_ref().map(|c| {
        json!({
            "season": c.season,
            "plaintiff": crate::views::actor_id(c.plaintiff),
            "demanded": crate::views::gold_pieces(c.demanded as i64),
            "outcome": match c.outcome { ClaimOutcome::Upheld => "upheld", ClaimOutcome::Dismissed => "dismissed" },
            "paid": crate::views::gold_pieces(c.paid as i64),
            "unpaid": crate::views::gold_pieces(c.unpaid as i64),
            "credibilityDelta": c.credibility_delta,
            "summary": c.summary,
        })
    });

    json!({
        "claimsThisSeason": game.claims_this_season,
        "maxClaimsPerSeason": MAX_CLAIMS_PER_SEASON,
        "credibility": game.credibility,
        "fallowIndemnitiesPaid": crate::views::gold_pieces(game.fallow_indemnities_paid as i64),
        "lastClaim": claim_view,
    })
}
