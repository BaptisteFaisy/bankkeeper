//! Read-only views: zones, prices, limits, council and gold totals.
//!
//! Views never mutate state, so the frontend polls them freely. Every
//! price carries its reasoning line for the UI (TW-UI-05).

use crate::game::{base_of, buyer_limit_milli, catch_of, licence_price_milli, quota_of, stock_health_bps};
use crate::{
    format_gold, npc_owner, Tidewater, TidewaterExt, COUNCIL_WEEK_START, GOLD_TOKEN, LICENCE_TOKEN,
    SEASON_DAYS,
};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{near, AccountId};

/// One zone: real stock (judges) plus the signals players see (TW-C1-02).
#[derive(Clone, Serialize, Deserialize)]
pub struct ZoneView {
    pub id: u8,
    pub name: String,
    pub species: String,
    pub stock: u64,
    pub capacity: u64,
    pub catch_per_trip: u64,
    pub trend: String,
    pub trend_bps: i64,
    pub closed: bool,
}

/// One buyer limit with its reasoning line (TW-N-31, TW-UI-05).
#[derive(Clone, Serialize, Deserialize)]
pub struct LimitView {
    pub buyer: String,
    pub species: String,
    pub limit_milli: u64,
    pub reasoning: String,
}

/// One actor card: gold, open flag, licence weight.
#[derive(Clone, Serialize, Deserialize)]
pub struct ActorView {
    pub id: String,
    pub name: String,
    pub gold_milli: u64,
    pub open: bool,
    pub licences: u64,
}

/// Gold conservation check (TW-N-42): supply must equal seed + flows.
#[derive(Clone, Serialize, Deserialize)]
pub struct GoldTotals {
    pub total_milli: u64,
    pub exterior_in_milli: u64,
    pub exterior_out_milli: u64,
}

/// Day, week and season clock plus the council flag.
#[derive(Clone, Serialize, Deserialize)]
pub struct DayView {
    pub day: u64,
    pub week: u64,
    pub season: u64,
    pub season_day: u64,
    pub council_open: bool,
    pub quota_per_licence: u64,
    pub small_mesh_banned: bool,
}

#[near]
impl Tidewater {
    pub fn get_zone(&self, zone_id: u8) -> ZoneView {
        let zone = self.zones.get(zone_id as usize).expect("E_UNKNOWN_ZONE");
        ZoneView {
            id: zone_id,
            name: zone.name.clone(),
            species: zone.species.clone(),
            stock: zone.stock,
            capacity: zone.capacity,
            catch_per_trip: catch_of(zone.stock, false),
            trend: trend_word(zone.trend_bps).to_string(),
            trend_bps: zone.trend_bps,
            closed: zone.closed_by_council,
        }
    }

    pub fn get_buyer_limit(&self, buyer_id: String, species: String) -> LimitView {
        let buyer = self.buyers.get(&buyer_id).expect("E_UNKNOWN_BUYER");
        assert!(buyer.species.contains(&species), "E_NOT_BUYING");
        let stock = buyer.stock.get(&species).copied().unwrap_or(0);
        let target = buyer.targets.get(&species).copied().unwrap_or(1);
        let base = base_of(&species);
        let limit = buyer_limit_milli(base, stock, target);
        LimitView {
            buyer: buyer_id,
            species,
            limit_milli: limit,
            reasoning: format!(
                "Limit {} = base {} (stock {} of {}).",
                format_gold(limit),
                format_gold(base),
                stock,
                target
            ),
        }
    }

    pub fn get_actor(&self, actor_id: String) -> ActorView {
        if let Some(buyer) = self.buyers.get(&actor_id) {
            return self.buyer_view(&actor_id, &buyer.name, !buyer.closed);
        }
        if self.captains.contains_key(&actor_id) {
            let owner = self.captain_owner(&actor_id);
            let open = !self.captains.get(&actor_id).expect("captain exists").disarmed;
            return ActorView {
                id: actor_id,
                name: format!("Captain {}", owner),
                gold_milli: self.gold_of(&owner),
                open,
                licences: self.licence_weight(&owner),
            };
        }
        let actor = self.actors.get(&actor_id).expect("E_UNKNOWN_ACTOR");
        ActorView {
            id: actor_id.clone(),
            name: actor.name.clone(),
            gold_milli: self.gold_of(&npc_owner(&actor_id)),
            open: true,
            licences: self.licence_weight(&npc_owner(&actor_id)),
        }
    }

    pub fn get_boat(&self, deed: String) -> crate::Boat {
        self.boats.get(&deed).expect("E_UNKNOWN_BOAT").clone()
    }

    pub fn get_loan(&self, token_id: String) -> crate::Loan {
        self.loans.get(&token_id).expect("E_UNKNOWN_LOAN").clone()
    }

    pub fn get_proposal(&self, proposal_id: u64) -> crate::Proposal {
        self.proposals.get(&proposal_id.to_string()).expect("E_UNKNOWN_PROPOSAL").clone()
    }

    pub fn get_licence_price(&self) -> u64 {
        let pairs: Vec<(u64, u64)> = self.zones.iter().map(|z| (z.stock, z.capacity)).collect();
        licence_price_milli(self.avg_price_milli, stock_health_bps(&pairs), self.quota_per_licence)
    }

    pub fn get_quota_left(&self, captain: String) -> u64 {
        let owner = self.captain_owner(&captain);
        let quota = quota_of(self.licence_weight(&owner), self.quota_per_licence);
        quota.saturating_sub(self.captains.get(&captain).map(|c| c.quota_used).unwrap_or(0))
    }

    pub fn get_gold_totals(&self) -> GoldTotals {
        GoldTotals {
            total_milli: crate::u64_of(self.supply.get(GOLD_TOKEN).copied().unwrap_or(0)),
            exterior_in_milli: self.exterior_in_milli,
            exterior_out_milli: self.exterior_out_milli,
        }
    }

    pub fn get_day(&self) -> DayView {
        DayView {
            day: self.day,
            week: self.day / 7,
            season: self.day / SEASON_DAYS,
            season_day: self.day % SEASON_DAYS,
            council_open: self.day % SEASON_DAYS >= COUNCIL_WEEK_START,
            quota_per_licence: self.quota_per_licence,
            small_mesh_banned: self.small_mesh_banned,
        }
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn get_fish(&self, owner: String) -> (u64, u64) {
        (
            crate::u64_of(self.balance_of(&owner, "1")),
            crate::u64_of(self.balance_of(&owner, "2")),
        )
    }

    pub fn get_licences(&self, owner: String) -> u64 {
        crate::u64_of(self.balance_of(&owner, LICENCE_TOKEN))
    }
}

impl Tidewater {
    fn buyer_view(&self, id: &str, name: &str, open: bool) -> ActorView {
        let owner = npc_owner(id);
        ActorView {
            id: id.to_string(),
            name: name.to_string(),
            gold_milli: self.gold_of(&owner),
            open,
            licences: self.licence_weight(&owner),
        }
    }
}

/// Falling trends say so in words and never blink (TW-UI-06).
fn trend_word(trend_bps: i64) -> &'static str {
    if trend_bps < -200 {
        "falling"
    } else if trend_bps > 200 {
        "rising"
    } else {
        "steady"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::{testing_env, AccountId};

    fn setup() -> (Tidewater, AccountId) {
        let owner = accounts(0);
        testing_env!(VMContextBuilder::new().predecessor_account_id(owner.clone()).build());
        (Tidewater::new(owner.clone(), accounts(1)), owner)
    }

    #[test]
    fn zone_quote_and_day_views() {
        let (game, _) = setup();
        let zone = game.get_zone(1);
        assert_eq!(zone.name, "Greybank");
        assert_eq!(zone.catch_per_trip, 20);
        assert_eq!(zone.trend, "steady");
        let limit = game.get_buyer_limit("cannery".to_string(), "1".to_string());
        assert_eq!(limit.limit_milli, 4_000);
        assert!(limit.reasoning.contains("stock 150 of 150"));
        let day = game.get_day();
        assert_eq!((day.day, day.council_open), (0, false));
        assert_eq!(game.get_licence_price(), 280_000);
    }

    #[test]
    fn actor_cards_cover_every_kind() {
        let (game, _) = setup();
        let marta = game.get_actor("marta".to_string());
        assert_eq!(marta.gold_milli, 500_000_000);
        assert_eq!(marta.licences, 4);
        let cannery = game.get_actor("cannery".to_string());
        assert!(cannery.open);
        let bank = game.get_actor("bank".to_string());
        assert_eq!(bank.gold_milli, 3_000_000_000);
        let totals = game.get_gold_totals();
        assert_eq!(totals.exterior_in_milli, 0);
        assert!(totals.total_milli > 0);
    }

    #[test]
    #[should_panic(expected = "E_NOT_BUYING")]
    fn gull_refuses_herring() {
        let (game, _) = setup();
        game.get_buyer_limit("gull".to_string(), "1".to_string());
    }
}
