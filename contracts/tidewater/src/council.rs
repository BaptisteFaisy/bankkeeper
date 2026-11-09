//! Harbour council: seasonal rule votes (TW-C4-01..05).
//!
//! Each licence is one vote. The author escrows an indemnity per licence
//! per week; yes-voters are paid from it when the tally resolves. NPCs
//! vote from their own reading of the sea via `game::evaluate_vote`.

use crate::game::{evaluate_vote, stock_health_bps, VoteCtx};
use crate::{
    npc_owner, u64_of, Proposal, ProposalKind, Tidewater, TidewaterExt, COUNCIL_WEEK_START,
    GOLD_TOKEN, LICENCE_SUPPLY, SEASON_DAYS,
};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near};

/// Outcome of a resolved council proposal (TW-C4-01..03).
#[derive(Clone, Serialize, Deserialize)]
pub struct CouncilOutcome {
    pub proposal_id: u64,
    pub passed: bool,
    pub yes_weight: u64,
    pub no_weight: u64,
    pub indemnities_milli: u64,
}

#[near]
impl Tidewater {
    /// Propose a council rule with an indemnity, escrowed (TW-C4-03).
    pub fn propose_rule(&mut self, kind: ProposalKind, indemnity_milli: U128) -> u64 {
        self.assert_council_open();
        let caller = env::predecessor_account_id().to_string();
        let escrow = u64_of(indemnity_milli.0) * LICENCE_SUPPLY * 4;
        assert!(self.gold_of(&caller) >= escrow, "E_SHORT_GOLD");
        self.move_balance(&caller, &npc_owner("escrow"), GOLD_TOKEN, escrow as u128);
        let id = self.next_proposal_id;
        self.next_proposal_id += 1;
        self.proposals.insert(
            id.to_string(),
            Proposal {
                author: caller,
                kind,
                indemnity_milli: u64_of(indemnity_milli.0),
                escrow_milli: escrow,
                yes_weight: 0,
                no_weight: 0,
                voters: Vec::new(),
                resolved: false,
                passed: false,
            },
        );
        id
    }

    /// Vote with your licences: one licence, one vote (TW-C4-02).
    pub fn vote(&mut self, proposal_id: u64, approve: bool) {
        self.assert_council_open();
        let key = proposal_id.to_string();
        let proposal = self.proposals.get(&key).expect("E_UNKNOWN_PROPOSAL").clone();
        assert!(!proposal.resolved, "E_RESOLVED");
        let caller = env::predecessor_account_id().to_string();
        assert!(!proposal.voters.contains(&caller), "E_ALREADY_VOTED");
        let weight = self.licence_weight(&caller);
        assert!(weight > 0, "E_NO_VOICE");
        self.record_vote(&key, &caller, weight, approve);
    }

    /// The relayer casts every NPC vote from its own reading (TW-C4-02).
    pub fn cast_npc_votes(&mut self, proposal_id: u64) {
        self.assert_owner();
        self.assert_council_open();
        let key = proposal_id.to_string();
        let proposal = self.proposals.get(&key).expect("E_UNKNOWN_PROPOSAL").clone();
        assert!(!proposal.resolved, "E_RESOLVED");
        let richest = self.richest_captain();
        for captain in ["marta", "brandt", "okoro"] {
            let owner = self.captain_owner(captain);
            if proposal.voters.contains(&owner) {
                continue;
            }
            let weight = self.licence_weight(&owner);
            let ctx = self.vote_ctx(captain, &proposal);
            let (mut approve, _) = evaluate_vote(captain, &proposal.kind, &ctx);
            if captain == "okoro" {
                let rich_ctx = self.vote_ctx(&richest, &proposal);
                approve = evaluate_vote(&richest, &proposal.kind, &rich_ctx).0;
            }
            if weight > 0 {
                self.record_vote(&key, &owner, weight, approve);
            }
        }
    }

    /// Tally the votes, apply the rule, pay the yes-voters (TW-C4-03).
    pub fn resolve_council(&mut self, proposal_id: u64) -> CouncilOutcome {
        self.assert_owner();
        let key = proposal_id.to_string();
        let mut proposal = self.proposals.get(&key).expect("E_UNKNOWN_PROPOSAL").clone();
        assert!(!proposal.resolved, "E_RESOLVED");
        proposal.passed = proposal.yes_weight > proposal.no_weight;
        proposal.resolved = true;
        if proposal.passed {
            self.apply_rule(&proposal.kind);
        }
        let mut paid = 0;
        if proposal.yes_weight > 0 {
            paid = self.pay_indemnities(&proposal);
        }
        let refund = proposal.escrow_milli - paid;
        if refund > 0 {
            self.move_balance(&npc_owner("escrow"), &proposal.author, GOLD_TOKEN, refund as u128);
        }
        self.proposals.insert(key, proposal.clone());
        CouncilOutcome {
            proposal_id,
            passed: proposal.passed,
            yes_weight: proposal.yes_weight,
            no_weight: proposal.no_weight,
            indemnities_milli: paid,
        }
    }
}

impl Tidewater {
    pub(crate) fn season_day(&self) -> u64 {
        self.day % SEASON_DAYS
    }

    pub(crate) fn assert_council_open(&self) {
        assert!(self.season_day() >= COUNCIL_WEEK_START, "E_COUNCIL_CLOSED");
    }

    fn record_vote(&mut self, key: &str, voter: &str, weight: u64, approve: bool) {
        let proposal = self.proposals.get_mut(key).expect("proposal exists");
        proposal.voters.push(voter.to_string());
        if approve {
            proposal.yes_weight += weight;
        } else {
            proposal.no_weight += weight;
        }
    }

    fn richest_captain(&self) -> String {
        ["marta", "brandt", "okoro", "player"]
            .into_iter()
            .max_by_key(|c| self.gold_of(&self.captain_owner(c)))
            .unwrap_or("marta")
            .to_string()
    }

    fn vote_ctx(&self, captain: &str, proposal: &Proposal) -> VoteCtx {
        let pairs: Vec<(u64, u64)> = self.zones.iter().map(|z| (z.stock, z.capacity)).collect();
        let zone_health = match &proposal.kind {
            ProposalKind::CloseZone(z) => self
                .zones
                .get(*z as usize)
                .map(|zone| zone.stock * 10_000 / zone.capacity.max(1))
                .unwrap_or(0),
            _ => stock_health_bps(&pairs),
        };
        VoteCtx {
            licences: self.licence_weight(&self.captain_owner(captain)),
            avg_price_milli: self.avg_price_milli,
            health_bps: stock_health_bps(&pairs),
            zone_health_bps: zone_health,
            current_quota: self.quota_per_licence,
            indemnity_season_milli: proposal.indemnity_milli * 4,
        }
    }

    fn apply_rule(&mut self, kind: &ProposalKind) {
        match kind {
            ProposalKind::QuotaPerLicence(next) => self.quota_per_licence = *next,
            ProposalKind::CloseZone(z) => {
                if let Some(zone) = self.zones.get_mut(*z as usize) {
                    zone.closed_by_council = true;
                }
            }
            ProposalKind::BanSmallMesh(ban) => self.small_mesh_banned = *ban,
        }
    }

    fn pay_indemnities(&mut self, proposal: &Proposal) -> u64 {
        let mut paid = 0;
        for voter in proposal.voters.clone() {
            let weight = self.licence_weight(&voter);
            let amount = proposal.indemnity_milli * weight * 4;
            if amount > 0 {
                self.move_balance(&npc_owner("escrow"), &voter, GOLD_TOKEN, amount as u128);
                paid += amount;
            }
        }
        paid
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::{testing_env, AccountId};

    fn setup() -> (Tidewater, AccountId, AccountId) {
        let owner = accounts(0);
        let player = accounts(1);
        testing_env!(VMContextBuilder::new().predecessor_account_id(owner.clone()).build());
        (Tidewater::new(owner.clone(), player.clone()), owner, player)
    }

    fn as_caller(caller: AccountId) {
        testing_env!(VMContextBuilder::new().predecessor_account_id(caller).build());
    }

    #[test]
    fn indemnity_flips_the_quota_vote() {
        let (mut game, owner, player) = setup();
        game.day = COUNCIL_WEEK_START;
        // No offer: a healthy sea leaves every NPC voting no.
        as_caller(player.clone());
        let bare = game.propose_rule(ProposalKind::QuotaPerLicence(50), U128(0));
        as_caller(owner.clone());
        game.cast_npc_votes(bare);
        let outcome = game.resolve_council(bare);
        assert!(!outcome.passed);
        assert_eq!(outcome.no_weight, 16);
        // A rich offer buys every yes, including Okoro who copies Marta.
        as_caller(player.clone());
        let paid = game.propose_rule(ProposalKind::QuotaPerLicence(50), U128(100_000));
        game.vote(paid, true);
        as_caller(owner);
        game.cast_npc_votes(paid);
        let outcome = game.resolve_council(paid);
        assert!(outcome.passed);
        assert_eq!((outcome.yes_weight, outcome.no_weight), (20, 0));
        assert_eq!(outcome.indemnities_milli, 8_000_000);
        assert_eq!(game.get_day().quota_per_licence, 50);
    }
}
