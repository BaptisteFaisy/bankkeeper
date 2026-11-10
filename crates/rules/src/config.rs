//! Starting values from brief section 12, plus the readings the brief leaves open.
//!
//! Every balance number the rules use lives here; game code reads values from
//! [`Config`] and hardcodes none. Readings (marked below) fill gaps the brief
//! does not pin down: auction floor, loan term, bailout cut, buyer targets,
//! licence fallback price. Amounts are centigold unless named otherwise.

use serde::{Deserialize, Serialize};

use crate::state::{ActorId, Species, Zone};

/// Config schema version. States refuse configs they do not understand.
pub const CONFIG_VERSION: u32 = 1;

/// Whole balance config. `Default` is the brief section 12 starting point.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub version: u32,
    /// Share of a zone stock taken by one trip, in bps (TW-N-02: 0.4%).
    pub catch_share_bps: u64,
    /// Daily logistic regrowth, in bps (TW-N-03: 5% herring, 2% cod).
    pub regrow_herring_bps: u64,
    pub regrow_cod_bps: u64,
    /// Max trips per boat per day (TW-N-10: 3).
    pub trips_per_boat_day: u64,
    /// Base prices in centigold (section 12: herring 4, cod 12).
    pub base_herring: u64,
    pub base_cod: u64,
    /// Dutch clock start per species (section 4.4: 8.0 for herring; cod needs
    /// a higher clock since its base alone is 12).
    pub clock_herring: u64,
    pub clock_cod: u64,
    /// Auction floor as a share of base, in bps. Reading: 25%.
    pub floor_bps: u64,
    /// Stock-factor gain in bps (section 12: factor = 1 + 0.5 x gap).
    pub stock_gain_bps: u64,
    /// Licence supply and weekly quota (TW-N-20: 20 x 70).
    pub licence_count: u64,
    pub quota_per_licence: u64,
    /// Seconds between two lots in the live build. The track asks for a beat
    /// every thirty seconds; with `trips_per_boat_day = 1` and ten boats, a day
    /// lasts five minutes, exactly as the track describes.
    pub seconds_per_lot: u64,
    /// Seasons per campaign. The sea keeps what the previous season left,
    /// so season 2 starts on a leaner bank: that is the handicap.
    pub campaign_seasons: u64,
    /// Licences one captain may hold at most. Reading (brief section 13,
    /// question 3): 8 of the 20, so no captain can outvote the port alone and
    /// the council keeps its teeth.
    pub licence_cap_per_captain: u64,
    /// Daily charge per boat, at sea or at quay (TW-C3-01: 6).
    pub daily_charge: u64,
    /// New boat price and max loan (TW-C3-02: 400 / 300).
    pub new_boat_cost: u64,
    pub loan_max: u64,
    /// Weekly loan rate in bps (TW-C3-02: 3%).
    pub loan_rate_weekly_bps: u64,
    /// Loan term in weeks. Reading: amortised over 10 weekly instalments.
    pub loan_term_weeks: u64,
    /// Survey price, tolerance window and validity (TW-C1: 80, +-10%, 7 days).
    pub survey_cost: u64,
    pub survey_tolerance_bps: u64,
    pub survey_valid_days: u64,
    /// Small-mesh catch multiplier in bps (TW-C2: x1.4).
    pub mesh_bonus_bps: u64,
    /// Max regrowth penalty from small mesh, in bps (TW-C2: halved at most).
    pub mesh_penalty_max_bps: u64,
    /// Missed weekly payments before seizure (TW-C3-03: 2).
    pub seizure_after_missed: u64,
    /// Bailout share of profits and repayment cap, in bps.
    /// Reading: 20% until 150% of the rescue gold is repaid.
    pub bailout_share_bps: u64,
    pub bailout_cap_bps: u64,
    pub days_per_week: u64,
    pub weeks_per_season: u64,
    /// Fallback licence price before any yield signal. Reading: 200 gold.
    pub base_licence_price: u64,
    /// Zone capacities in crates (section 4.1: 3000 / 5000 / 2000).
    pub zone_capacity: [u64; 3],
    /// Trip cost per zone in centigold (section 4.1: 2 / 4 / 7).
    pub zone_trip_cost: [u64; 3],
    /// Starting purses in centigold, indexed by actor (section 3).
    pub starting_gold: [i64; 10],
    /// Starting licence holdings, indexed by actor (section 3).
    pub starting_licences: [u64; 10],
    /// Starting fleet, indexed by actor (section 3: 2/2/4/2 boats).
    pub starting_boats: [u64; 10],
    /// Buyer stock targets in crates, [actor][species]. Zero means the actor
    /// does not buy that species (Cannery target 150 is brief section 4.4;
    /// the other targets are readings).
    pub buyer_targets: [[u64; 2]; 10],
}

/// Starting purses in centigold, indexed by actor (brief section 3).
fn starting_gold() -> [i64; 10] {
    [
        15_000, 50_000, 20_000, 30_000, 60_000, 300_000, 40_000, 300_000, 100_000, 150_000,
    ]
}

/// Starting licence holdings, indexed by actor (brief section 3).
fn starting_licences() -> [u64; 10] {
    [4, 4, 8, 4, 0, 0, 0, 0, 0, 0]
}

/// Starting fleet, indexed by actor (brief section 3: 2/2/4/2 boats).
fn starting_boats() -> [u64; 10] {
    [2, 2, 4, 2, 0, 0, 0, 0, 0, 0]
}

/// Buyer stock targets, [actor][species] (Cannery herring 150 is brief 4.4).
fn buyer_targets() -> [[u64; 2]; 10] {
    [
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
        [60, 30],
        [150, 0],
        [0, 60],
        [0, 0],
        [0, 0],
        [0, 0],
    ]
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: CONFIG_VERSION,
            catch_share_bps: 40,
            regrow_herring_bps: 500,
            regrow_cod_bps: 200,
            trips_per_boat_day: 3,
            base_herring: 400,
            base_cod: 1200,
            clock_herring: 800,
            clock_cod: 2000,
            floor_bps: 2500,
            stock_gain_bps: 5000,
            licence_count: 20,
            quota_per_licence: 70,
            seconds_per_lot: 30,
            campaign_seasons: 3,
            licence_cap_per_captain: 8,
            daily_charge: 600,
            new_boat_cost: 40_000,
            loan_max: 30_000,
            loan_rate_weekly_bps: 300,
            loan_term_weeks: 10,
            survey_cost: 8000,
            survey_tolerance_bps: 1000,
            survey_valid_days: 7,
            mesh_bonus_bps: 14_000,
            mesh_penalty_max_bps: 5000,
            seizure_after_missed: 2,
            bailout_share_bps: 2000,
            bailout_cap_bps: 15_000,
            days_per_week: 7,
            weeks_per_season: 4,
            base_licence_price: 20_000,
            zone_capacity: [3000, 5000, 2000],
            zone_trip_cost: [200, 400, 700],
            starting_gold: starting_gold(),
            starting_licences: starting_licences(),
            starting_boats: starting_boats(),
            buyer_targets: buyer_targets(),
        }
    }
}

impl Config {
    /// True when this config matches the schema the rules understand.
    pub fn version_ok(&self) -> bool {
        self.version == CONFIG_VERSION
    }

    /// Species living in a zone (section 4.1).
    pub fn zone_species(zone: Zone) -> Species {
        match zone {
            Zone::Shallows | Zone::Greybank => Species::Herring,
            Zone::Deeps => Species::Cod,
        }
    }

    /// Base price of a species in centigold.
    pub fn base_price(&self, species: Species) -> u64 {
        match species {
            Species::Herring => self.base_herring,
            Species::Cod => self.base_cod,
        }
    }

    /// Dutch clock start for a species in centigold.
    pub fn clock_start(&self, species: Species) -> u64 {
        match species {
            Species::Herring => self.clock_herring,
            Species::Cod => self.clock_cod,
        }
    }

    /// Daily regrowth rate of a species in bps.
    pub fn regrow_rate(&self, species: Species) -> u64 {
        match species {
            Species::Herring => self.regrow_herring_bps,
            Species::Cod => self.regrow_cod_bps,
        }
    }

    /// Starting purse of an actor in centigold (brief section 3).
    pub fn purse(&self, actor: ActorId) -> i64 {
        self.starting_gold[actor.idx()]
    }

    /// Stock target of a buyer for a species; 0 means "does not buy".
    pub fn buyer_target(&self, actor: ActorId, species: Species) -> u64 {
        self.buyer_targets[actor.idx()][species.idx()]
    }

    /// True when the actor buys that species at the auction.
    pub fn buys(&self, actor: ActorId, species: Species) -> bool {
        self.buyer_target(actor, species) > 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_brief_section_12() {
        let cfg = Config::default();
        assert!(cfg.version_ok());
        assert_eq!(cfg.catch_share_bps, 40);
        assert_eq!((cfg.regrow_herring_bps, cfg.regrow_cod_bps), (500, 200));
        assert_eq!(cfg.trips_per_boat_day, 3);
        assert_eq!((cfg.base_herring, cfg.base_cod), (400, 1200));
        assert_eq!(cfg.stock_gain_bps, 5000);
        assert_eq!((cfg.licence_count, cfg.quota_per_licence), (20, 70));
        assert_eq!(cfg.daily_charge, 600);
        assert_eq!((cfg.new_boat_cost, cfg.loan_max), (40_000, 30_000));
        assert_eq!(cfg.loan_rate_weekly_bps, 300);
        assert_eq!(cfg.survey_cost, 8000);
        assert_eq!(cfg.zone_capacity, [3000, 5000, 2000]);
        assert_eq!(cfg.zone_trip_cost, [200, 400, 700]);
    }

    #[test]
    fn roster_matches_brief_section_3() {
        let cfg = Config::default();
        assert_eq!(cfg.purse(ActorId::You), 15_000);
        assert_eq!(cfg.purse(ActorId::Cannery), 300_000);
        assert_eq!(cfg.starting_boats.iter().sum::<u64>(), 10);
        assert_eq!(cfg.starting_licences.iter().sum::<u64>(), 20);
        assert!(cfg.buys(ActorId::Cannery, Species::Herring));
        assert!(!cfg.buys(ActorId::Cannery, Species::Cod));
        assert!(!cfg.buys(ActorId::Gull, Species::Herring));
        assert_eq!(cfg.buyer_target(ActorId::Cannery, Species::Herring), 150);
    }
}
