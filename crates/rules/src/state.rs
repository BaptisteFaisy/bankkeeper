//! Shared state vocabulary: zones, actors, tokens, boats, harbour.
//!
//! The [`Harbour`] struct is the day-0 foundation plus the live core state
//! (stocks, purses, licences, fleet). Layer books (loans, surveys, mesh
//! pressure) live in their own modules; rule modules only read or update the
//! core through small helpers here.

use serde::{Deserialize, Serialize};

use crate::config::Config;

/// Token id. Ranges follow brief section 6 (NEP-245 plan).
pub type TokenId = u16;

/// Gold (0), the currency. Counted in centigold, never in floats.
pub const GOLD: TokenId = 0;
/// Herring (1) and cod (2), counted in whole crates once landed.
pub const HERRING: TokenId = 1;
pub const COD: TokenId = 2;
/// Catch licence (3): 20 in circulation, each 70 crates/week.
pub const LICENCE: TokenId = 3;
/// Boat deeds 10-29: deed id = 10 + boat id.
pub const BOAT_DEED_BASE: TokenId = 10;
pub const BOAT_DEED_LAST: TokenId = 29;
/// Loan notes 100-199 and bailout shares 200+: one id per debt / rescue.
pub const LOAN_BASE: TokenId = 100;
pub const LOAN_LAST: TokenId = 199;
pub const SHARE_BASE: TokenId = 200;

/// True for the gold token (amounts in centigold).
pub fn is_gold(token: TokenId) -> bool {
    token == GOLD
}

/// True for boat-deed tokens (10-29).
pub fn is_boat_deed(token: TokenId) -> bool {
    (BOAT_DEED_BASE..=BOAT_DEED_LAST).contains(&token)
}

/// True for loan-note tokens (100-199).
pub fn is_loan_note(token: TokenId) -> bool {
    (LOAN_BASE..=LOAN_LAST).contains(&token)
}

/// True for bailout-share tokens (200 and up).
pub fn is_share(token: TokenId) -> bool {
    token >= SHARE_BASE
}

/// English display name for known tokens.
pub fn token_name(token: TokenId) -> &'static str {
    match token {
        GOLD => "gold",
        HERRING => "herring",
        COD => "cod",
        LICENCE => "licence",
        t if is_boat_deed(t) => "boat deed",
        t if is_loan_note(t) => "loan note",
        t if is_share(t) => "share",
        _ => "unknown",
    }
}

/// The three fishing zones (TW-N-01).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Zone {
    Shallows,
    Greybank,
    Deeps,
}

impl Zone {
    /// Array index of the zone (0, 1, 2).
    pub fn idx(self) -> usize {
        match self {
            Self::Shallows => 0,
            Self::Greybank => 1,
            Self::Deeps => 2,
        }
    }

    /// Display name used in surveys and the ledger.
    pub fn name(self) -> &'static str {
        match self {
            Self::Shallows => "The Shallows",
            Self::Greybank => "Greybank",
            Self::Deeps => "The Deeps",
        }
    }

    /// All zones in canonical order.
    pub fn all() -> [Zone; 3] {
        [Self::Shallows, Self::Greybank, Self::Deeps]
    }
}

/// The two species (section 4.1: herring inshore, cod in the Deeps).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Species {
    Herring,
    Cod,
}

impl Species {
    /// Array index of the species (0, 1).
    pub fn idx(self) -> usize {
        match self {
            Self::Herring => 0,
            Self::Cod => 1,
        }
    }

    /// Display name used at the auction.
    pub fn name(self) -> &'static str {
        match self {
            Self::Herring => "herring",
            Self::Cod => "cod",
        }
    }
}

/// Net on a boat (TW-C2-02): large mesh is neutral, small mesh catches more
/// young fish now and slows regrowth later.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Mesh {
    Large,
    Small,
}

impl Mesh {
    /// Display name used in the harbour ledger.
    pub fn name(self) -> &'static str {
        match self {
            Self::Large => "large mesh",
            Self::Small => "small mesh",
        }
    }
}

/// Everybody who can hold value (brief section 3). Fixed roster, stable order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum ActorId {
    You,
    Hale,
    Brandt,
    Okoro,
    Fishmonger,
    Cannery,
    Gull,
    Bank,
    Chandlery,
    Townsfolk,
}

impl ActorId {
    /// Array index of the actor (0-9).
    pub fn idx(self) -> usize {
        match self {
            Self::You => 0,
            Self::Hale => 1,
            Self::Brandt => 2,
            Self::Okoro => 3,
            Self::Fishmonger => 4,
            Self::Cannery => 5,
            Self::Gull => 6,
            Self::Bank => 7,
            Self::Chandlery => 8,
            Self::Townsfolk => 9,
        }
    }

    /// Display name used in reasoning lines.
    pub fn name(self) -> &'static str {
        match self {
            Self::You => "You",
            Self::Hale => "Hale",
            Self::Brandt => "Brandt",
            Self::Okoro => "Okoro",
            Self::Fishmonger => "Fishmonger",
            Self::Cannery => "Cannery",
            Self::Gull => "The Gull",
            Self::Bank => "Harbour Bank",
            Self::Chandlery => "Chandlery",
            Self::Townsfolk => "Townsfolk",
        }
    }

    /// True for the four captains (one human, three NPC).
    pub fn is_captain(self) -> bool {
        matches!(self, Self::You | Self::Hale | Self::Brandt | Self::Okoro)
    }

    /// True for the three auction buyers.
    pub fn is_buyer(self) -> bool {
        matches!(self, Self::Fishmonger | Self::Cannery | Self::Gull)
    }

    /// All actors in canonical order (also the auction tie-break order).
    pub fn all() -> [ActorId; 10] {
        [
            Self::You,
            Self::Hale,
            Self::Brandt,
            Self::Okoro,
            Self::Fishmonger,
            Self::Cannery,
            Self::Gull,
            Self::Bank,
            Self::Chandlery,
            Self::Townsfolk,
        ]
    }

    /// The four captains in canonical order.
    pub fn captains() -> [ActorId; 4] {
        [Self::You, Self::Hale, Self::Brandt, Self::Okoro]
    }

    /// The three buyers in canonical order.
    pub fn buyers() -> [ActorId; 3] {
        [Self::Fishmonger, Self::Cannery, Self::Gull]
    }
}

/// One boat: owner, assigned zone (`None` = at quay), net.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Boat {
    pub id: u64,
    pub owner: ActorId,
    pub zone: Option<Zone>,
    pub mesh: Mesh,
}

impl Boat {
    /// NEP-245 deed id of this boat (section 6: 10 + boat id).
    pub fn deed(&self) -> TokenId {
        BOAT_DEED_BASE + self.id as u16
    }
}

/// Live core state: day, stocks, purses, licences, fleet.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Harbour {
    /// Current game day (0 = foundation).
    pub day: u64,
    /// Sim seed; same seed + same orders = same season.
    pub seed: u64,
    /// Fish left in each zone, in crates, indexed by zone.
    pub stocks: [u64; 3],
    /// Gold purses in centigold (may go below zero: TW-N-50), by actor.
    pub gold: [i64; 10],
    /// Licence tokens held, by actor.
    pub licences: [u64; 10],
    /// Crates landed since Monday, by actor (quota tracking).
    pub weekly_catch: [u64; 10],
    /// Fish held by buyers in crates, [actor][species].
    pub stores: [[u64; 2]; 10],
    /// The ten boats of the port (TW-N-13).
    pub boats: Vec<Boat>,
    /// Trips sailed today, parallel to `boats`.
    pub trips_today: Vec<u64>,
    /// Laid-up captains and closed buyers (TW-N-50..51), by actor.
    pub stopped: [bool; 10],
    /// Licences awaiting auction after a bankruptcy (TW-N-50).
    pub licence_pool: u64,
}

impl Harbour {
    /// Day-0 foundation: full stocks, section 3 roster, fleet at quay.
    pub fn foundation(config: &Config, seed: u64) -> Self {
        let mut boats = Vec::new();
        let mut id = 0;
        for captain in ActorId::captains() {
            for _ in 0..config.starting_boats[captain.idx()] {
                boats.push(Boat {
                    id,
                    owner: captain,
                    zone: None,
                    mesh: Mesh::Large,
                });
                id += 1;
            }
        }
        let trips_today = vec![0; boats.len()];
        Self {
            day: 0,
            seed,
            stocks: config.zone_capacity,
            gold: config.starting_gold,
            licences: config.starting_licences,
            weekly_catch: [0; 10],
            stores: [[0; 2]; 10],
            boats,
            trips_today,
            stopped: [false; 10],
            licence_pool: 0,
        }
    }

    /// Week number (0-based): TW-N-21 quotas reset every Monday.
    pub fn week(&self, config: &Config) -> u64 {
        self.day / config.days_per_week
    }

    /// Season number (0-based): TW-C4 council sits every 4 weeks.
    pub fn season(&self, config: &Config) -> u64 {
        self.day / (config.days_per_week * config.weeks_per_season)
    }

    /// Total gold in the port, the TW-N-42 conservation input.
    pub fn total_gold(&self) -> i64 {
        self.gold.iter().sum()
    }

    /// Total licences held (held + pool must stay 20 forever).
    pub fn total_licences(&self) -> u64 {
        self.licences.iter().sum::<u64>() + self.licence_pool
    }

    /// Fish in a zone, in crates.
    pub fn stock(&self, zone: Zone) -> u64 {
        self.stocks[zone.idx()]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn harbour() -> Harbour {
        Harbour::foundation(&Config::default(), 7)
    }

    #[test]
    fn foundation_matches_brief_sections_3_and_4() {
        let port = harbour();
        assert_eq!(port.stocks, [3000, 5000, 2000]);
        assert_eq!(port.boats.len(), 10);
        assert_eq!(port.total_licences(), 20);
        assert_eq!(port.total_gold(), 1_065_000);
        assert_eq!(port.licences[ActorId::Brandt.idx()], 8);
        assert!(port.boats.iter().all(|b| b.zone.is_none()));
        assert_eq!(port.boats[0].deed(), 10);
    }

    #[test]
    fn token_ranges_follow_brief_section_6() {
        assert!(is_gold(0) && !is_gold(1));
        assert!(is_boat_deed(10) && is_boat_deed(29) && !is_boat_deed(30));
        assert!(is_loan_note(100) && is_loan_note(199) && !is_loan_note(200));
        assert!(is_share(200) && is_share(999) && !is_share(199));
        assert_eq!(token_name(LICENCE), "licence");
        assert_eq!(token_name(250), "share");
        assert_eq!(token_name(50), "unknown");
    }

    #[test]
    fn harbour_roundtrips_through_json() {
        let port = harbour();
        let json = serde_json::to_string(&port).expect("serialize");
        let back: Harbour = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(back.total_gold(), port.total_gold());
        assert_eq!(back.boats.len(), 10);
    }
}
