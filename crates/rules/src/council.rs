//! TW-C4: the seasonal harbour council.
//!
//! Every season end, captains vote the next quota per licence and may close
//! a zone or ban small mesh (TW-C4-01), one vote per licence. Each NPC votes
//! the option worth most to it on its own estimates (TW-C4-02); the player
//! may attach a per-licence weekly indemnity to buy yes-votes (TW-C4-03).
//! Licence prices follow expected yield (TW-C4-04).

use serde::{Deserialize, Serialize};

use crate::state::{ActorId, Zone};

/// One council motion for next season.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Proposal {
    pub quota_per_licence: u64,
    pub close_zone: Option<Zone>,
    pub ban_small_mesh: bool,
    /// Gold per licence per week paid to yes-voters (TW-C4-03), centigold.
    pub indemnity_per_licence_week: u64,
}

/// A ballot on a proposal.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Vote {
    For,
    Against,
}

/// TW-C4-02: vote the most profitable side, indemnity included.
pub fn npc_vote(
    profit_if_pass: i64,
    profit_if_fail: i64,
    licences: u64,
    indemnity_per_licence_week: u64,
    weeks: u64,
) -> Vote {
    let offer = i64::try_from(
        indemnity_per_licence_week.saturating_mul(licences).saturating_mul(weeks),
    )
    .unwrap_or(i64::MAX);
    if profit_if_pass.saturating_add(offer) >= profit_if_fail {
        Vote::For
    } else {
        Vote::Against
    }
}

/// Weighted tally: one vote per licence; passes on strict majority.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Tally {
    pub for_votes: u64,
    pub against_votes: u64,
    pub passed: bool,
}

/// Tally ballots given as (voter, vote, licences held).
pub fn tally(ballots: &[(ActorId, Vote, u64)]) -> Tally {
    let mut for_votes = 0;
    let mut against_votes = 0;
    for (_, vote, licences) in ballots {
        match vote {
            Vote::For => for_votes += licences,
            Vote::Against => against_votes += licences,
        }
    }
    Tally {
        for_votes,
        against_votes,
        passed: for_votes * 2 > for_votes + against_votes,
    }
}

/// TW-C4-04: a licence is worth its expected weekly catch value, so the price
/// rises when the sea is healthy and falls when it is not.
pub fn licence_price(expected_crate_price: u64, quota_per_licence: u64) -> u64 {
    expected_crate_price.saturating_mul(quota_per_licence)
}

/// Total indemnity bill for the yes-voters over a season.
pub fn indemnity_cost(for_licences: u64, per_licence_week: u64, weeks: u64) -> u64 {
    for_licences.saturating_mul(per_licence_week).saturating_mul(weeks)
}

/// Brief section 5.4 reasoning line: "Brandt votes no: a 50-crate quota costs
/// him 640 a week, your offer pays 400."
pub fn vote_reasoning(
    name: &str,
    vote: Vote,
    quota: u64,
    weekly_cost: u64,
    offer: u64,
) -> String {
    let word = match vote {
        Vote::For => "yes",
        Vote::Against => "no",
    };
    format!("{name} votes {word}: a {quota}-crate quota costs him {weekly_cost} a week, your offer pays {offer}.")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn npc_votes_its_own_profit() {
        assert_eq!(npc_vote(1000, 500, 8, 0, 4), Vote::For);
        assert_eq!(npc_vote(100, 500, 8, 0, 4), Vote::Against);
    }

    #[test]
    fn a_fat_indemnity_flips_the_vote() {
        // Brandt loses 2,560 a season to the quota; 100/licence/week over 8
        // licences and 4 weeks pays 3,200 and buys his yes.
        assert_eq!(npc_vote(0, 2560, 8, 0, 4), Vote::Against);
        assert_eq!(npc_vote(0, 2560, 8, 100, 4), Vote::For);
        assert_eq!(indemnity_cost(8, 100, 4), 3200);
        assert_eq!(
            vote_reasoning("Brandt", Vote::Against, 50, 640, 400),
            "Brandt votes no: a 50-crate quota costs him 640 a week, your offer pays 400."
        );
    }

    #[test]
    fn tally_needs_a_strict_majority() {
        let tie = vec![
            (ActorId::You, Vote::For, 10),
            (ActorId::Brandt, Vote::Against, 10),
        ];
        assert_eq!(
            tally(&tie),
            Tally {
                for_votes: 10,
                against_votes: 10,
                passed: false
            }
        );
        let pass = vec![
            (ActorId::You, Vote::For, 11),
            (ActorId::Brandt, Vote::Against, 9),
        ];
        assert!(tally(&pass).passed);
    }

    #[test]
    fn licence_price_follows_expected_yield() {
        assert_eq!(licence_price(350, 70), 24_500);
        assert_eq!(licence_price(100, 70), 7_000);
    }
}
