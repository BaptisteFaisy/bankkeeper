//! Harbour actions: trips, auction, bailouts and the day cycle.
//!
//! The human player works their own boats; the owner (relayer) pilots NPC
//! boats and the day cycle. Every sale settles atomically through the
//! [`crate::game`] rules and pays captain shareholders before returning.
//! Bailouts live in [`crate::bailout`], loans in [`crate::loans`],
//! the council in [`crate::council`].

use crate::game::{
    base_of, buyer_limit_milli, catch_of, clear_auction, floor_of, licence_price_milli, quota_of,
    regrow, stock_health_bps,
};
use crate::{
    format_gold, npc_owner, Tidewater, TidewaterExt, CLOCK_MULT_BPS, COUNCIL_WEEK_START, GOLD_TOKEN,
    LICENCE_TOKEN, TRIPS_PER_DAY, UPKEEP_MILLI_PER_DAY,
};
use near_sdk::{env, near};

/// Receipt for one landing and its instant auction (TW-N-12, TW-N-30).
#[near(serializers = [json])]
#[derive(Clone)]
pub struct LotReceipt {
    pub deed: String,
    pub crates: u64,
    pub species: String,
    pub price_milli: u64,
    pub total_milli: u64,
    pub buyer: Option<String>,
    pub reasoning: String,
}

/// Outcome of one harbour day (TW-N-03, TW-C3-01, TW-N-50..51).
#[near(serializers = [json])]
#[derive(Clone)]
pub struct DayOutcome {
    pub day: u64,
    pub regrowth: Vec<u64>,
    pub upkeep_milli: u64,
    pub bankruptcies: Vec<String>,
    pub loans_defaulted: Vec<String>,
    pub council_open: bool,
}

#[near]
impl Tidewater {
    /// Assign a boat to a zone (or moor it with `None`). Two clicks in UI.
    pub fn assign_boat(&mut self, deed: String, zone: Option<u8>, small_mesh: bool) {
        let boat = self.boats.get(&deed).expect("E_UNKNOWN_BOAT").clone();
        self.assert_boat_caller(&boat.captain);
        if let Some(z) = zone {
            assert!((z as usize) < self.zones.len(), "E_UNKNOWN_ZONE");
            assert!(!self.zones[z as usize].closed_by_council, "E_ZONE_CLOSED");
        }
        if small_mesh {
            assert!(!self.small_mesh_banned, "E_MESH_BANNED");
        }
        let slot = self.boats.get_mut(&deed).expect("boat exists");
        slot.zone = zone;
        slot.small_mesh = small_mesh;
    }

    /// Land one trip: pay the trip, take the catch, clear the auction.
    pub fn land_lot(&mut self, deed: String) -> LotReceipt {
        let boat = self.boats.get(&deed).expect("E_UNKNOWN_BOAT").clone();
        self.assert_boat_caller(&boat.captain);
        let captain = self.captains.get(&boat.captain).expect("E_UNKNOWN_CAPTAIN").clone();
        assert!(!captain.disarmed, "E_CAPTAIN_DISARMED");
        let zone_id = boat.zone.expect("E_BOAT_MOORED") as usize;
        let zone = self.zones[zone_id].clone();
        assert!(!zone.closed_by_council, "E_ZONE_CLOSED");
        assert!(boat.trips_today < TRIPS_PER_DAY, "E_TRIPS_SPENT");
        if boat.small_mesh {
            assert!(!self.small_mesh_banned, "E_MESH_BANNED");
        }
        let remaining = self.quota_left(&boat.captain);
        assert!(remaining > 0, "E_QUOTA_SPENT");
        let owner = captain.owner.clone();
        assert!(self.gold_of(&owner) >= zone.trip_cost_milli, "E_SHORT_GOLD");
        // Trip cost: 20 % stays with the chandlery, 80 % leaves the
        // harbour for imported fuel (TW-N-40; the split is ours).
        let chandlery = npc_owner("chandlery");
        let margin = zone.trip_cost_milli / 5;
        self.move_balance(&owner, &chandlery, GOLD_TOKEN, margin as u128);
        self.burn_outside(&owner, zone.trip_cost_milli - margin);
        let take = catch_of(zone.stock, boat.small_mesh).min(remaining).min(zone.stock);
        assert!(take > 0, "E_SEA_EMPTY");
        self.zones[zone_id].stock -= take;
        self.zones[zone_id].day_landed += take;
        self.zones[zone_id].day_trips += 1;
        let slot = self.boats.get_mut(&deed).expect("boat exists");
        slot.trips_today += 1;
        let captain_slot = self.captains.get_mut(&boat.captain).expect("captain exists");
        captain_slot.quota_used += take;
        self.add_balance(&owner, &zone.species, take as u128);
        self.clear_lot(&deed, &boat.captain, &owner, zone_id, take)
    }

    /// Buy one bank-held licence at the quoted price (TW-N-50, TW-C4-04).
    pub fn buy_licence(&mut self) -> LotReceipt {
        let caller = env::predecessor_account_id().to_string();
        let bank = npc_owner("bank");
        assert!(self.balance_of(&bank, LICENCE_TOKEN) > 0, "E_NO_LICENCE");
        let price = self.licence_price();
        assert!(self.gold_of(&caller) >= price, "E_SHORT_GOLD");
        self.move_balance(&caller, &bank, GOLD_TOKEN, price as u128);
        self.move_balance(&bank, &caller, LICENCE_TOKEN, 1);
        LotReceipt {
            deed: String::new(),
            crates: 1,
            species: LICENCE_TOKEN.to_string(),
            price_milli: price,
            total_milli: price,
            buyer: Some(caller),
            reasoning: format!("Licence bought for {} gold.", format_gold(price)),
        }
    }

    /// One harbour day. Owner (relayer) only: regrowth, upkeep, drain,
    /// weekly loans and bankruptcies (TW-N-03, TW-C3-01, TW-N-50..51).
    pub fn run_day(&mut self) -> DayOutcome {
        self.assert_owner();
        let mut outcome = DayOutcome {
            day: self.day + 1,
            regrowth: Vec::new(),
            upkeep_milli: 0,
            bankruptcies: Vec::new(),
            loans_defaulted: Vec::new(),
            council_open: self.season_day() >= COUNCIL_WEEK_START,
        };
        self.regrow_zones(&mut outcome);
        outcome.upkeep_milli = self.collect_upkeep();
        self.drain_buyers();
        if self.day % 7 == 6 {
            self.settle_loans(&mut outcome);
            self.settle_bankruptcies(&mut outcome);
            for captain in self.captains.values_mut() {
                captain.quota_used = 0;
            }
        }
        for boat in self.boats.values_mut() {
            boat.trips_today = 0;
        }
        self.day += 1;
        outcome
    }
}

impl Tidewater {
    fn assert_boat_caller(&self, captain: &str) {
        let caller = env::predecessor_account_id();
        if captain == "player" {
            assert_eq!(caller, self.player, "E_NOT_YOUR_BOAT");
        } else {
            assert_eq!(caller, self.owner, "owner only");
        }
    }

    fn quota_left(&self, captain: &str) -> u64 {
        let owner = self.captain_owner(captain);
        let quota = quota_of(self.licence_weight(&owner), self.quota_per_licence);
        quota.saturating_sub(self.captains.get(captain).map(|c| c.quota_used).unwrap_or(0))
    }

    fn clear_lot(&mut self, deed: &str, captain: &str, owner: &str, zone_id: usize, take: u64) -> LotReceipt {
        let species = self.zones[zone_id].species.clone();
        let base = base_of(&species);
        let floor = floor_of(base);
        // Bidders short of gold sit this lot out; ties break on buyer id.
        let bids: Vec<(String, u64)> = self
            .collect_bids(&species)
            .into_iter()
            .filter(|(buyer, limit)| {
                *limit >= floor && self.gold_of(&npc_owner(buyer)) >= limit.saturating_mul(take)
            })
            .collect();
        match clear_auction(&bids, floor) {
            Some((buyer, price)) => self.settle_lot(deed, captain, owner, &buyer, &species, take, base, price),
            None => {
                self.sub_balance(owner, &species, take as u128);
                LotReceipt {
                    deed: deed.to_string(),
                    crates: take,
                    species,
                    price_milli: 0,
                    total_milli: 0,
                    buyer: None,
                    reasoning: format!("Lot of {} lost: no buyer above the floor.", take),
                }
            }
        }
    }

    fn collect_bids(&self, species: &str) -> Vec<(String, u64)> {
        let mut bids: Vec<(String, u64)> = self
            .buyers
            .iter()
            .filter(|(_, b)| !b.closed && b.species.contains(&species.to_string()))
            .map(|(id, b)| {
                let stock = b.stock.get(species).copied().unwrap_or(0);
                let target = b.targets.get(species).copied().unwrap_or(1);
                (id.clone(), buyer_limit_milli(base_of(species), stock, target))
            })
            .collect();
        bids.sort();
        bids
    }

    fn settle_lot(&mut self, deed: &str, captain: &str, owner: &str, buyer: &str, species: &str, take: u64, base: u64, price: u64) -> LotReceipt {
        let total = price * take;
        let buyer_owner = npc_owner(buyer);
        self.move_balance(&buyer_owner, owner, GOLD_TOKEN, total as u128);
        self.move_balance(owner, &buyer_owner, species, take as u128);
        let slot = self.buyers.get_mut(buyer).expect("buyer exists");
        let entry = slot.stock.entry(species.to_string()).or_insert(0);
        *entry += take;
        self.avg_price_milli = (self.avg_price_milli + price) / 2;
        let cut = self.pay_shareholders(captain, "captain", owner, total);
        let stock = self.buyers.get(buyer).expect("buyer exists").stock.get(species).copied().unwrap_or(0);
        let target = self.buyers.get(buyer).expect("buyer exists").targets.get(species).copied().unwrap_or(1);
        let name = self.buyers.get(buyer).expect("buyer exists").name.clone();
        LotReceipt {
            deed: deed.to_string(),
            crates: take,
            species: species.to_string(),
            price_milli: price,
            total_milli: total - cut,
            buyer: Some(buyer.to_string()),
            reasoning: format!(
                "Sold to {}: {} x {} = {}. Limit {} = base {} (stock {} of {}). Clock from {}.",
                name, take, format_gold(price), format_gold(total), format_gold(price), format_gold(base), stock, target, format_gold(base * CLOCK_MULT_BPS / 10_000)
            ),
        }
    }

    fn licence_price(&self) -> u64 {
        let pairs: Vec<(u64, u64)> = self.zones.iter().map(|z| (z.stock, z.capacity)).collect();
        licence_price_milli(self.avg_price_milli, stock_health_bps(&pairs), self.quota_per_licence)
    }

    fn regrow_zones(&mut self, outcome: &mut DayOutcome) {
        for zone in self.zones.iter_mut() {
            let grown = regrow(zone.stock, zone.capacity, zone.regrow_bps, zone.small_mesh_share_bps);
            zone.stock += grown;
            outcome.regrowth.push(grown);
            let today = if zone.day_trips > 0 { zone.day_landed / zone.day_trips as u64 } else { 0 };
            zone.trend_bps = if zone.last_catch > 0 {
                (today as i64 - zone.last_catch as i64) * 10_000 / zone.last_catch as i64
            } else {
                0
            };
            zone.last_catch = today;
            zone.day_landed = 0;
            zone.day_trips = 0;
        }
    }

    fn collect_upkeep(&mut self) -> u64 {
        let residents = npc_owner("residents");
        let mut paid = 0;
        let deeds: Vec<String> = self.boats.keys().cloned().collect();
        for deed in deeds {
            let captain = self.boats.get(&deed).expect("boat exists").captain.clone();
            let owner = self.captain_owner(&captain);
            let due = UPKEEP_MILLI_PER_DAY.min(self.gold_of(&owner));
            if due > 0 {
                self.move_balance(&owner, &residents, GOLD_TOKEN, due as u128);
                paid += due;
            }
        }
        paid
    }

    fn drain_buyers(&mut self) {
        for id in ["fishmonger", "cannery", "gull"] {
            let species: Vec<String> = self.buyers.get(id).map(|b| b.species.clone()).unwrap_or_default();
            for token in species {
                self.drain_stock(id, &token);
            }
        }
    }

    /// Buyers resell at 1.5 x base; the cannery exports (outside gold),
    /// the gull splits residents and travellers, the fishmonger sells local.
    /// Resale prices are ours: the brief only sets the buying rule.
    fn drain_stock(&mut self, buyer: &str, species: &str) {
        let (stock, target) = match self.buyers.get(buyer) {
            Some(b) if !b.closed => (b.stock.get(species).copied().unwrap_or(0), b.targets.get(species).copied().unwrap_or(0)),
            _ => return,
        };
        if stock == 0 || target == 0 {
            return;
        }
        let price = base_of(species) * 3 / 2;
        let residents = npc_owner("residents");
        let buyer_owner = npc_owner(buyer);
        let volume = stock.min(target / 7 + 1);
        let affordable = match buyer {
            "cannery" => volume,
            "gull" => volume.min(self.gold_of(&residents) * 2 / price.max(1)),
            _ => volume.min(self.gold_of(&residents) / price.max(1)),
        };
        if affordable == 0 {
            return;
        }
        let proceeds = affordable * price;
        match buyer {
            "cannery" => self.mint_outside(&buyer_owner, proceeds),
            "gull" => {
                let local = proceeds / 2;
                self.move_balance(&residents, &buyer_owner, GOLD_TOKEN, local.min(self.gold_of(&residents)) as u128);
                self.mint_outside(&buyer_owner, proceeds - local);
            }
            _ => {
                let pay = proceeds.min(self.gold_of(&residents));
                self.move_balance(&residents, &buyer_owner, GOLD_TOKEN, pay as u128);
            }
        }
        let slot = self.buyers.get_mut(buyer).expect("buyer exists");
        slot.stock.insert(species.to_string(), stock - affordable);
        self.sub_balance(&buyer_owner, species, affordable as u128);
        self.pay_shareholders(buyer, "buyer", &buyer_owner, proceeds);
    }

    fn settle_bankruptcies(&mut self, outcome: &mut DayOutcome) {
        let bank = npc_owner("bank");
        let captains: Vec<String> = self.captains.keys().cloned().collect();
        for id in captains {
            let owner = self.captain_owner(&id);
            if self.gold_of(&owner) == 0 {
                self.captains.get_mut(&id).expect("captain exists").disarmed = true;
                let held = self.balance_of(&owner, LICENCE_TOKEN);
                if held > 0 {
                    self.move_balance(&owner, &bank, LICENCE_TOKEN, held);
                }
                outcome.bankruptcies.push(id.clone());
            }
        }
        let buyers: Vec<String> = self.buyers.keys().cloned().collect();
        for id in buyers {
            if self.gold_of(&npc_owner(&id)) == 0 {
                self.buyers.get_mut(&id).expect("buyer exists").closed = true;
                outcome.bankruptcies.push(id.clone());
            }
        }
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
    fn landing_sells_to_best_limit() {
        let (mut game, _, player) = setup();
        as_caller(player.clone());
        let receipt = game.land_lot("10".to_string());
        assert_eq!(receipt.crates, 20);
        assert_eq!(receipt.buyer, Some("fishmonger".to_string()));
        assert_eq!(receipt.price_milli, 4_000);
        assert!(receipt.reasoning.contains("Sold to Fishmonger"));
        assert_eq!(game.get_ledger(player.to_string(), "0".to_string()).0, 150_000_000 - 4_000 + 80_000);
    }

    #[test]
    fn quota_stops_the_fifth_week_trip() {
        let (mut game, _, player) = setup();
        as_caller(player);
        game.captains.get_mut("player").unwrap().quota_used = 280;
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            game.land_lot("10".to_string());
        }));
        assert!(result.is_err());
    }

    #[test]
    fn day_regrows_and_charges_upkeep() {
        let (mut game, owner, _) = setup();
        as_caller(owner);
        game.zones[1].stock = 2_000;
        let outcome = game.run_day();
        assert_eq!(outcome.regrowth[1], 60);
        assert_eq!(outcome.upkeep_milli, 60_000);
        // +60 upkeep, -72 fishmonger herring, -108 fishmonger cod, -81 gull half.
        assert_eq!(game.get_ledger(npc_owner("residents"), "0".to_string()).0, 1_499_799_000);
    }

}
