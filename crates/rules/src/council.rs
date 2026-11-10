//! TW-C4: the seasonal harbour council.
//!
//! Every season end, captains vote the next quota per licence and may close
//! a zone or ban small mesh (TW-C4-01), one vote per licence. Each NPC votes
//! the option worth most to it on its own estimates (TW-C4-02); the player
//! may attach a per-licence weekly indemnity to buy yes-votes (TW-C4-03).
//! Licence prices follow expected yield (TW-C4-04).

use serde::{Deserialize, Serialize};

use crate::state::{ActorId, Zone};

/// Barreau 3: where the gold an indemnity promises actually comes from.
///
/// A motion that promises money without saying who pays is a promise, not a
/// budget. The council votes both at once.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Funding {
    /// The port fund pays: levy the port has already collected.
    Fund,
    /// A further levy on next season's landings pays as they land.
    Levies,
}

impl Funding {
    /// Relay and view slug: "fund" or "levies".
    pub fn slug(self) -> &'static str {
        match self {
            Funding::Fund => "fund",
            Funding::Levies => "levies",
        }
    }

    /// Read a slug back (relay token `pay:fund`, `pay:levies`).
    pub fn from_slug(value: &str) -> Option<Self> {
        match value.trim().to_lowercase().as_str() {
            "fund" | "portfund" | "port-fund" => Some(Funding::Fund),
            "levies" | "levy" | "extralevy" | "extra-levy" => Some(Funding::Levies),
            _ => None,
        }
    }

    /// The source in a sentence: "the port fund", "an extra levy".
    pub fn label(self) -> &'static str {
        match self {
            Funding::Fund => "the port fund",
            Funding::Levies => "an extra levy",
        }
    }
}

/// One council motion for next season.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Proposal {
    pub quota_per_licence: u64,
    pub close_zone: Option<Zone>,
    pub ban_small_mesh: bool,
    /// Gold per licence per week paid to yes-voters (TW-C4-03), centigold.
    pub indemnity_per_licence_week: u64,
    /// Barreau 3: the source that pays that indemnity. `None` on a motion
    /// that promises nothing; `default` keeps saves written before motions
    /// had to carry their money.
    #[serde(default)]
    pub funding: Option<Funding>,
    /// Landing levy for next season in centigold per crate. `None` means the
    /// motion leaves the levy alone; `default` keeps quota-only motions (and
    /// saves written before the levy) deserialising.
    #[serde(default)]
    pub levy_per_crate: Option<u64>,
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

impl Proposal {
    /// Barreau 3: the source that pays the indemnity. A motion that promises
    /// nothing has no source; one that promises carries one — a motion written
    /// before motions had to say is read as paid by the port fund.
    pub fn funding(&self) -> Option<Funding> {
        if self.indemnity_per_licence_week == 0 {
            None
        } else {
            Some(self.funding.unwrap_or(Funding::Fund))
        }
    }

    /// Total bill over a season for `licences` paid licence-weeks, centigold.
    pub fn bill(&self, licences: u64, weeks: u64) -> u64 {
        indemnity_cost(licences, self.indemnity_per_licence_week, weeks)
    }
}

/// Whole crates with a space every three digits: 1800 -> "1 800".
pub fn crates_count(crates: u64) -> String {
    let digits = crates.to_string();
    let mut out = String::new();
    for (pos, digit) in digits.chars().enumerate() {
        if pos > 0 && (digits.len() - pos).is_multiple_of(3) {
            out.push(' ');
        }
        out.push(digit);
    }
    out
}

/// Barreau 3, second half of the reasoning line: what the captain took from
/// the bank this season, from the barreau 1 attribution.
pub fn took_this_season(crates: u64, zone: Option<&str>) -> String {
    match zone {
        Some(place) if crates > 0 => {
            format!("He took {} crates from {place} this season.", crates_count(crates))
        }
        _ => "He took no crates from the bank this season.".to_string(),
    }
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

/// Levy reasoning line (barreau 2): "Brandt votes no: a 0.8 levy costs him
/// 640 a week, your offer pays 400." Same shape as [`vote_reasoning`], with the
/// levy in the place the quota takes there.
pub fn vote_reasoning_levy(
    name: &str,
    vote: Vote,
    levy: u64,
    weekly_cost: u64,
    offer: u64,
) -> String {
    let word = match vote {
        Vote::For => "yes",
        Vote::Against => "no",
    };
    format!(
        "{name} votes {word}: a {} levy costs him {weekly_cost} a week, your offer pays {offer}.",
        crate::format_price(levy)
    )
}

/// What a captain's season costs in levy: crates x rate per week, centigold.
pub fn levy_week_cost(crates_per_week: u64, levy_per_crate: u64) -> i64 {
    crates_per_week.saturating_mul(levy_per_crate) as i64
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
    fn levy_reasoning_names_the_levy_and_its_weekly_bill() {
        // Barreau 2, brief section 5.4 shape: the instrument first, the weekly
        // cost second, the offer last.
        assert_eq!(
            vote_reasoning_levy("Brandt", Vote::Against, 80, 640, 400),
            "Brandt votes no: a 0.8 levy costs him 640 a week, your offer pays 400."
        );
        assert_eq!(levy_week_cost(800, 80), 64_000);
        assert_eq!(levy_week_cost(0, 80), 0);
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

    fn motion(indemnity: u64, funding: Option<Funding>) -> Proposal {
        Proposal {
            quota_per_licence: 50,
            close_zone: None,
            ban_small_mesh: false,
            indemnity_per_licence_week: indemnity,
            funding,
            levy_per_crate: None,
        }
    }

    #[test]
    fn a_promise_without_money_has_no_source_and_no_bill() {
        let free = motion(0, None);
        assert_eq!(free.funding(), None);
        assert_eq!(free.bill(15, 4), 0);
    }

    #[test]
    fn a_promise_carries_its_source_and_its_season_bill() {
        let paid = motion(400, Some(Funding::Levies));
        assert_eq!(paid.funding(), Some(Funding::Levies));
        // 400 a licence a week, 15 licences paid, four weeks a season.
        assert_eq!(paid.bill(15, 4), 24_000);
        // A motion written before the rule existed is read as fund-paid.
        assert_eq!(motion(400, None).funding(), Some(Funding::Fund));
        assert_eq!(Funding::from_slug("Fund"), Some(Funding::Fund));
        assert_eq!(Funding::from_slug(" extra-levy "), Some(Funding::Levies));
        assert_eq!(Funding::from_slug("sea"), None);
        assert_eq!(Funding::Levies.slug(), "levies");
    }

    #[test]
    fn the_reasoning_line_ends_on_what_the_captain_took() {
        assert_eq!(crates_count(0), "0");
        assert_eq!(crates_count(999), "999");
        assert_eq!(crates_count(1_800), "1 800");
        assert_eq!(crates_count(1_234_567), "1 234 567");
        assert_eq!(
            took_this_season(1_800, Some("Greybank")),
            "He took 1 800 crates from Greybank this season."
        );
        assert!(took_this_season(0, None).contains("took no crates"));
    }
}
