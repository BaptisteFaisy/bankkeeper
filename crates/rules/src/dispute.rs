//! Barreau 5 — Réparer : the collective fallow and the claim against the fund.
//!
//! Two exits only, and they are collective:
//!
//! 1. **The collective fallow**: the council votes a closure of a zone for N
//!    weeks. The sea regrows, fishing stops on that bank, and the port fund
//!    compensates the captains the closure penalizes.
//! 2. **The claim against the fund**: a captain the rule penalized can claim
//!    compensation from the port fund. Exactly **one claim per season**, no
//!    more — the bound the spine sets so the claim never becomes a way to
//!    slow the game down. A claim the council upholds is paid out of the fund
//!    (the gold stays in the port); a claim it dismisses costs credibility,
//!    and credibility is what makes the next motions pass.
//!
//! Numbers only, no sermons.

use crate::state::ActorId;
use serde::{Deserialize, Serialize};

/// Maximum claims heard per season: exactly one, as bounded by the spine.
pub const MAX_CLAIMS_PER_SEASON: u64 = 1;

/// Credibility lost when a claim is dismissed as unfounded.
pub const CLAIM_LOST_CREDIBILITY_PENALTY: i32 = 2;

/// Credibility floor below which a proposer's motion is no longer admitted:
/// a captain with no standing does not get the floor.
pub const PROPOSER_CREDIBILITY_FLOOR: i32 = -3;

/// A demand above twice the proven loss is treated as abusive.
pub const EXCESSIVE_DEMAND_FACTOR: u64 = 2;

/// Outcome of a claim heard by the council.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClaimOutcome {
    /// The claim was upheld: the fund owes the plaintiff.
    Upheld,
    /// The claim was dismissed: the plaintiff lost credibility.
    Dismissed,
}

/// A captain's claim against the port fund for the injury a voted rule did him.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Claim {
    /// The season in which the claim was heard.
    pub season: u64,
    /// The captain seeking compensation.
    pub plaintiff: ActorId,
    /// Gold demanded, in centigold.
    pub demanded: u64,
    /// What the council decided.
    pub outcome: ClaimOutcome,
    /// Gold the fund actually paid, in centigold.
    pub paid: u64,
    /// Gold the fund could not pay yet, in centigold: written down, never hidden.
    #[serde(default)]
    pub unpaid: u64,
    /// Credibility the plaintiff lost (0 when the claim was upheld).
    pub credibility_delta: i32,
    /// Factual summary: figures, no sermon.
    pub summary: String,
}

/// What the council decided and what it costs the plaintiff.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClaimVerdict {
    pub outcome: ClaimOutcome,
    /// Gold the fund owes the plaintiff, in centigold.
    pub due: u64,
    /// Credibility the plaintiff loses (0 or negative).
    pub credibility_delta: i32,
}

/// What the council decides about a claim.
///
/// A claim is upheld when it is grounded: the rule did the plaintiff real,
/// proven harm, and the demand stays within twice that harm (a demand above
/// that is abusive). The fund then owes the proven loss, or what it holds.
/// A claim with no proven harm behind it, or an abusive demand, is dismissed
/// and the plaintiff loses credibility.
pub fn adjudicate_claim(proven_loss: u64, demanded: u64) -> ClaimVerdict {
    let excessive = demanded > proven_loss.saturating_mul(EXCESSIVE_DEMAND_FACTOR);
    if proven_loss == 0 || excessive {
        return ClaimVerdict {
            outcome: ClaimOutcome::Dismissed,
            due: 0,
            credibility_delta: -CLAIM_LOST_CREDIBILITY_PENALTY,
        };
    }
    let due = demanded.min(proven_loss);
    ClaimVerdict { outcome: ClaimOutcome::Upheld, due, credibility_delta: 0 }
}

/// The split between what the fund can pay now and what it owes for later.
pub fn settle_payment(due: u64, fund_balance: i64) -> (u64, u64) {
    let paid = due.min(fund_balance.max(0) as u64);
    (paid, due - paid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_grounded_claim_is_upheld() {
        let verdict = adjudicate_claim(10_000, 8_000);
        assert_eq!(verdict.outcome, ClaimOutcome::Upheld);
        assert_eq!(verdict.due, 8_000);
        assert_eq!(verdict.credibility_delta, 0);
    }

    #[test]
    fn a_claim_with_no_injury_is_dismissed_with_penalty() {
        let verdict = adjudicate_claim(0, 5_000);
        assert_eq!(verdict.outcome, ClaimOutcome::Dismissed);
        assert_eq!(verdict.due, 0);
        assert_eq!(verdict.credibility_delta, -CLAIM_LOST_CREDIBILITY_PENALTY);
    }

    #[test]
    fn an_abusive_demand_is_dismissed_with_penalty() {
        // Demanding 250 gold on a 100 gold loss is abusive (> 2x).
        let verdict = adjudicate_claim(10_000, 25_000);
        assert_eq!(verdict.outcome, ClaimOutcome::Dismissed);
        assert_eq!(verdict.credibility_delta, -CLAIM_LOST_CREDIBILITY_PENALTY);
    }

    #[test]
    fn the_fund_pays_what_it_holds_and_owes_the_rest() {
        assert_eq!(settle_payment(10_000, 4_000), (4_000, 6_000));
        assert_eq!(settle_payment(10_000, 0), (0, 10_000));
        assert_eq!(settle_payment(10_000, 50_000), (10_000, 0));
    }
}
