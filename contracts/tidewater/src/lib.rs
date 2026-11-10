//! Tidewater NEP-245 multi-token contract.
//!
//! One contract holds every token from brief section 6: gold (0), herring
//! (1), cod (2), licences (3), boat deeds (10-19), loan notes (100+) and
//! bailout shares (200+). Fish at sea is NOT a token: it belongs to nobody
//! until landed. Balances are keyed by owner string: player NEAR accounts
//! and internal NPC owners (`npc:<actor>`). Standard entry points live in
//! [`nep245`], game entry points in [`actions`], pure rules in [`game`].

pub mod actions;
pub mod bailout;
pub mod council;
pub mod game;
pub mod loans;
pub mod nep245;
pub mod views;

use near_sdk::{env, near, AccountId, PanicOnDefault};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Token ids (brief section 6) and fixed-point money.
// ---------------------------------------------------------------------------

/// Gold balances are stored in milli-gold so auction prices like 3.6 stay exact.
pub const MILLIS_PER_GOLD: u64 = 1_000;
pub const GOLD_TOKEN: &str = "0";
pub const HERRING_TOKEN: &str = "1";
pub const COD_TOKEN: &str = "2";
pub const LICENCE_TOKEN: &str = "3";
pub const BOAT_DEED_FIRST: u32 = 10;
pub const BOAT_COUNT: u32 = 10;
pub const LOAN_FIRST: u32 = 100;
pub const SHARE_FIRST: u32 = 200;

/// NPC ledger owners are plain strings, never NEAR accounts.
pub fn npc_owner(actor: &str) -> String {
    format!("npc:{}", actor)
}

// ---------------------------------------------------------------------------
// Economy parameters (brief sections 4 and 12).
// ---------------------------------------------------------------------------

pub const HERRING_BASE_MILLI: u64 = 4_000;
pub const COD_BASE_MILLI: u64 = 12_000;
/// Auction clock starts at twice the base price; the floor is a quarter.
/// The brief names a floor (TW-N-33) but gives no value: base / 4 is ours.
pub const CLOCK_MULT_BPS: u64 = 20_000;
pub const FLOOR_DIVISOR: u64 = 4;
/// Catches take 0.4 % of the zone stock (TW-N-02).
pub const CATCH_SHARE_BPS: u64 = 40;
pub const TRIPS_PER_DAY: u32 = 3;
pub const LICENCE_SUPPLY: u64 = 20;
/// Licences the bank holds to sell: four of the twenty, so `buy_licence`
/// works on day one instead of waiting for a captain to go bankrupt.
pub const BANK_LICENCE_POOL: u64 = 4;
/// Licences one captain may hold (brief section 13, question 3): the council
/// stays contested, nobody buys the port.
pub const LICENCE_CAP_PER_CAPTAIN: u64 = 8;
pub const START_QUOTA_PER_LICENCE: u64 = 70;
pub const UPKEEP_MILLI_PER_DAY: u64 = 6_000;
/// Stock-factor gain, in bps: merchants pay 50% more than base on an empty
/// store, 50% less on a store twice its target. Spelled here once, used by
/// `rules::merchant` from both sides of the wire.
pub const STOCK_GAIN_BPS: u64 = 5_000;
/// Shareholders of a bailed-out actor take 20 % of its sales proceeds.
/// The brief (TW-N-52) promises "a share" without a number: 20 % is ours.
pub const SHARE_CUT_BPS: u64 = 2_000;
pub const SEASON_DAYS: u64 = 28;
pub const COUNCIL_WEEK_START: u64 = 21;

// ---------------------------------------------------------------------------
// State.
// ---------------------------------------------------------------------------

/// Token metadata (NEP-245 Metadata extension, game subset).
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct TokenMeta {
    pub token_id: String,
    pub name: String,
    pub base_price_milli: u64,
}

/// A captain: the human player (`player`) or an NPC id.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Captain {
    pub owner: String,
    pub disarmed: bool,
    pub quota_used: u64,
    pub share_ids: Vec<String>,
}

/// A boat and its current assignment. Deed token holder owns the boat.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Boat {
    pub deed: String,
    pub captain: String,
    pub zone: Option<u8>,
    pub small_mesh: bool,
    pub trips_today: u32,
}

/// A fish buyer: stock targets drive its auction limits (TW-N-31).
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Buyer {
    pub name: String,
    pub species: Vec<String>,
    pub targets: HashMap<String, u64>,
    pub stock: HashMap<String, u64>,
    pub closed: bool,
    pub share_ids: Vec<String>,
}

/// Bank, chandlery and residents never close; gold lives in the ledger.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Actor {
    pub name: String,
}

/// One fishing zone: a shared stock with logistic regrowth (TW-N-01..05).
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Zone {
    pub name: String,
    pub species: String,
    pub capacity: u64,
    pub stock: u64,
    pub trip_cost_milli: u64,
    pub regrow_bps: u64,
    pub small_mesh_share_bps: u64,
    pub closed_by_council: bool,
    pub last_catch: u64,
    pub trend_bps: i64,
    pub day_landed: u64,
    pub day_trips: u64,
}

/// A loan is a transferable note token (100+). The lender seizes the boat
/// deed after two missed weekly payments (TW-C3-03).
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Loan {
    pub borrower: String,
    pub lender: String,
    pub owed_milli: u64,
    pub weekly_due_milli: u64,
    pub missed: u8,
    pub boat_deed: String,
    pub token_id: String,
}

/// One bailout event: profit shares (200+) pay from sales proceeds.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Share {
    pub actor: String,
    pub actor_kind: String,
    pub invested_milli: u64,
    pub repaid_milli: u64,
}

/// Council rule proposals (TW-C4-01): quota, zone closure, mesh ban.
#[near(serializers=[json, borsh])]
#[derive(Clone)]
pub enum ProposalKind {
    QuotaPerLicence(u64),
    CloseZone(u8),
    BanSmallMesh(bool),
}

/// A council proposal with licence-weighted votes (TW-C4-02).
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Proposal {
    pub author: String,
    pub kind: ProposalKind,
    pub indemnity_milli: u64,
    pub escrow_milli: u64,
    pub yes_weight: u64,
    pub no_weight: u64,
    pub voters: Vec<String>,
    pub resolved: bool,
    pub passed: bool,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Tidewater {
    owner: AccountId,
    player: AccountId,
    day: u64,
    quota_per_licence: u64,
    small_mesh_banned: bool,
    avg_price_milli: u64,
    tokens: Vec<TokenMeta>,
    balances: HashMap<(String, String), u128>,
    supply: HashMap<String, u128>,
    captains: HashMap<String, Captain>,
    boats: HashMap<String, Boat>,
    buyers: HashMap<String, Buyer>,
    actors: HashMap<String, Actor>,
    zones: Vec<Zone>,
    loans: HashMap<String, Loan>,
    next_loan_id: u32,
    shares: HashMap<String, Share>,
    next_share_id: u32,
    proposals: HashMap<String, Proposal>,
    next_proposal_id: u64,
    exterior_in_milli: u64,
    exterior_out_milli: u64,
}

#[near]
impl Tidewater {
    #[init]
    pub fn new(owner: AccountId, player: AccountId) -> Self {
        let mut game = Self {
            owner,
            player: player.clone(),
            day: 0,
            quota_per_licence: START_QUOTA_PER_LICENCE,
            small_mesh_banned: false,
            avg_price_milli: HERRING_BASE_MILLI,
            tokens: Self::game_tokens(),
            balances: HashMap::new(),
            supply: HashMap::new(),
            captains: HashMap::new(),
            boats: HashMap::new(),
            buyers: HashMap::new(),
            actors: HashMap::new(),
            zones: Self::game_zones(),
            loans: HashMap::new(),
            next_loan_id: LOAN_FIRST + 1,
            shares: HashMap::new(),
            next_share_id: SHARE_FIRST,
            proposals: HashMap::new(),
            next_proposal_id: 1,
            exterior_in_milli: 0,
            exterior_out_milli: 0,
        };
        game.seed_world(player);
        game
    }
}

impl Tidewater {
    fn game_tokens() -> Vec<TokenMeta> {
        let mut tokens = vec![
            ("0", "Gold", 1_000),
            ("1", "Herring", HERRING_BASE_MILLI),
            ("2", "Cod", COD_BASE_MILLI),
            ("3", "Licence", 0),
        ]
        .into_iter()
        .map(|(id, name, base)| TokenMeta {
            token_id: id.to_string(),
            name: name.to_string(),
            base_price_milli: base,
        })
        .collect::<Vec<_>>();
        for deed in BOAT_DEED_FIRST..BOAT_DEED_FIRST + BOAT_COUNT {
            tokens.push(TokenMeta {
                token_id: deed.to_string(),
                name: format!("Boat deed {}", deed),
                base_price_milli: 400_000,
            });
        }
        tokens.push(TokenMeta {
            token_id: LOAN_FIRST.to_string(),
            name: "Brandt loan note".to_string(),
            base_price_milli: 0,
        });
        tokens
    }

    fn game_zones() -> Vec<Zone> {
        [
            ("The Shallows", HERRING_TOKEN, 3_000, 2_000, 500),
            ("Greybank", HERRING_TOKEN, 5_000, 4_000, 500),
            ("The Deeps", COD_TOKEN, 2_000, 7_000, 200),
        ]
        .into_iter()
        .map(|(name, species, capacity, cost, regrow)| Zone {
            name: name.to_string(),
            species: species.to_string(),
            capacity,
            stock: capacity,
            trip_cost_milli: cost,
            regrow_bps: regrow,
            small_mesh_share_bps: 0,
            closed_by_council: false,
            last_catch: 0,
            trend_bps: 0,
            day_landed: 0,
            day_trips: 0,
        })
        .collect()
    }

    fn seed_world(&mut self, player: AccountId) {
        self.seed_captain("player", &player.to_string(), 150_000, 4, &["10", "11"]);
        self.seed_captain("marta", &npc_owner("marta"), 500_000, 4, &["12", "13"]);
        // Brandt held 8 of the 20; he now holds 4 so the bank can sell from
        // day one while the supply stays exactly LICENCE_SUPPLY.
        self.seed_captain("brandt", &npc_owner("brandt"), 200_000, 4, &["14", "15", "16", "17"]);
        self.seed_captain("okoro", &npc_owner("okoro"), 300_000, 4, &["18", "19"]);
        self.seed_buyer("fishmonger", "Fishmonger", 600_000, &[("1", 80), ("2", 40)]);
        self.seed_buyer("cannery", "Cannery", 3_000_000, &[("1", 150)]);
        self.seed_buyer("gull", "The Gull", 400_000, &[("2", 60)]);
        self.seed_actor("bank", "Harbour Bank", 3_000_000);
        self.add_balance(&npc_owner("bank"), LICENCE_TOKEN, BANK_LICENCE_POOL as u128);
        self.seed_actor("chandlery", "Chandlery", 1_000_000);
        self.seed_actor("residents", "Habitants", 1_500_000);
        self.seed_brandt_loan();
    }

    fn seed_captain(&mut self, id: &str, owner: &str, gold: u64, licences: u64, deeds: &[&str]) {
        self.captains.insert(
            id.to_string(),
            Captain {
                owner: owner.to_string(),
                disarmed: false,
                quota_used: 0,
                share_ids: Vec::new(),
            },
        );
        self.add_balance(owner, GOLD_TOKEN, (gold as u128) * (MILLIS_PER_GOLD as u128));
        self.add_balance(owner, LICENCE_TOKEN, licences as u128);
        for deed in deeds {
            self.boats.insert(
                deed.to_string(),
                Boat {
                    deed: deed.to_string(),
                    captain: id.to_string(),
                    zone: Some(1),
                    small_mesh: false,
                    trips_today: 0,
                },
            );
            self.add_balance(owner, deed, 1);
        }
    }

    fn seed_buyer(&mut self, id: &str, name: &str, gold: u64, targets: &[(&str, u64)]) {
        let owner = npc_owner(id);
        let target_map: HashMap<String, u64> =
            targets.iter().map(|(k, v)| (k.to_string(), *v)).collect();
        self.buyers.insert(
            id.to_string(),
            Buyer {
                name: name.to_string(),
                species: targets.iter().map(|(k, _)| k.to_string()).collect(),
                targets: target_map.clone(),
                stock: target_map,
                closed: false,
                share_ids: Vec::new(),
            },
        );
        self.add_balance(&owner, GOLD_TOKEN, (gold as u128) * (MILLIS_PER_GOLD as u128));
        self.actors.insert(id.to_string(), Actor { name: name.to_string() });
    }

    fn seed_actor(&mut self, id: &str, name: &str, gold: u64) {
        self.actors.insert(id.to_string(), Actor { name: name.to_string() });
        let owner = npc_owner(id);
        self.add_balance(&owner, GOLD_TOKEN, (gold as u128) * (MILLIS_PER_GOLD as u128));
    }

    /// Brandt starts indebted: 96 gold due weekly against boat deed 14.
    fn seed_brandt_loan(&mut self) {
        let bank = npc_owner("bank");
        self.loans.insert(
            LOAN_FIRST.to_string(),
            Loan {
                borrower: "brandt".to_string(),
                lender: bank.clone(),
                owed_milli: 960_000,
                weekly_due_milli: 96_000,
                missed: 0,
                boat_deed: "14".to_string(),
                token_id: LOAN_FIRST.to_string(),
            },
        );
        self.add_balance(&bank, &LOAN_FIRST.to_string(), 1);
    }

    pub(crate) fn token(&self, token_id: &str) -> Option<&TokenMeta> {
        self.tokens.iter().find(|t| t.token_id == token_id)
    }

    pub(crate) fn balance_of(&self, owner: &str, token_id: &str) -> u128 {
        self.balances
            .get(&(owner.to_string(), token_id.to_string()))
            .copied()
            .unwrap_or(0)
    }

    pub(crate) fn add_balance(&mut self, owner: &str, token_id: &str, amount: u128) {
        let key = (owner.to_string(), token_id.to_string());
        let entry = self.balances.entry(key).or_insert(0);
        *entry = entry.saturating_add(amount);
        let supply = self.supply.entry(token_id.to_string()).or_insert(0);
        *supply = supply.saturating_add(amount);
    }

    pub(crate) fn sub_balance(&mut self, owner: &str, token_id: &str, amount: u128) {
        let key = (owner.to_string(), token_id.to_string());
        let entry = self.balances.entry(key).or_insert(0);
        *entry = entry.saturating_sub(amount);
        let supply = self.supply.entry(token_id.to_string()).or_insert(0);
        *supply = supply.saturating_sub(amount);
    }

    /// Move existing tokens between owners without touching supply.
    pub(crate) fn move_balance(&mut self, from: &str, to: &str, token_id: &str, amount: u128) {
        let key = (from.to_string(), token_id.to_string());
        let entry = self.balances.entry(key).or_insert(0);
        *entry = entry.saturating_sub(amount);
        let key = (to.to_string(), token_id.to_string());
        let entry = self.balances.entry(key).or_insert(0);
        *entry = entry.saturating_add(amount);
    }

    /// Mint gold from outside the harbour (exports, travellers).
    pub(crate) fn mint_outside(&mut self, owner: &str, milli: u64) {
        self.exterior_in_milli = self.exterior_in_milli.saturating_add(milli);
        self.add_balance(owner, GOLD_TOKEN, milli as u128);
    }

    /// Burn gold to the outside (imported fuel and bait).
    pub(crate) fn burn_outside(&mut self, owner: &str, milli: u64) {
        self.exterior_out_milli = self.exterior_out_milli.saturating_add(milli);
        self.sub_balance(owner, GOLD_TOKEN, milli as u128);
    }

    pub(crate) fn captain_owner(&self, captain: &str) -> String {
        self.captains.get(captain).map(|c| c.owner.clone()).unwrap_or_default()
    }

    pub(crate) fn licence_weight(&self, owner: &str) -> u64 {
        u64_of(self.balance_of(owner, LICENCE_TOKEN))
    }

    pub(crate) fn assert_owner(&self) {
        assert_eq!(env::predecessor_account_id(), self.owner, "owner only");
    }

    pub(crate) fn gold_of(&self, owner: &str) -> u64 {
        u64_of(self.balance_of(owner, GOLD_TOKEN))
    }
}

/// NEP-297 event log (NEAR Events, required by NEP-245).
pub(crate) fn log_event(standard: &str, event: &str, data: &str) {
    env::log_str(&format!(
        "EVENT_JSON:{{\"standard\":\"{}\",\"version\":\"1.0.0\",\"event\":\"{}\",\"data\":{}}}",
        standard, event, data
    ));
}

pub(crate) fn u64_of(balance: u128) -> u64 {
    u64::try_from(balance).expect("E_OVERFLOW")
}

/// One-decimal gold for reasoning lines: 50400 -> "50.4".
pub fn format_gold(milli: u64) -> String {
    format!("{}.{}", milli / MILLIS_PER_GOLD, (milli % MILLIS_PER_GOLD) / 100)
}
