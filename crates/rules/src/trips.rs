//! TW-N-10..13: boats, trips, landing quotas.
//!
//! A boat sails at most three trips a day (TW-N-10), each trip paying the
//! zone cost to the chandlery; every trip lands one lot sold at once
//! (TW-N-12). A captain whose weekly quota is exhausted stays at quay
//! (TW-N-21). A boat sails while any quota is left; the landed crates count
//! in full even past the line (the catch cannot be thrown back).

use crate::config::Config;
use crate::state::Zone;

/// Trips a boat may still sail today after `done` trips (TW-N-10: max 3).
pub fn trips_left(done: u64, config: &Config) -> u64 {
    config.trips_per_boat_day.saturating_sub(done)
}

/// Crates a captain may still land this week (TW-N-20: 70 per licence).
pub fn quota_left(licences: u64, weekly_catch: u64, config: &Config) -> u64 {
    licences
        .saturating_mul(config.quota_per_licence)
        .saturating_sub(weekly_catch)
}

/// True when the boat may sail one more trip right now.
pub fn can_sail(
    stopped: bool,
    done_trips: u64,
    licences: u64,
    weekly_catch: u64,
    config: &Config,
) -> bool {
    !stopped && trips_left(done_trips, config) > 0 && quota_left(licences, weekly_catch, config) > 0
}

/// Trip cost in centigold, paid to the chandlery (TW-N-10).
pub fn trip_cost(zone: Zone, config: &Config) -> u64 {
    config.zone_trip_cost[zone.idx()]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> Config {
        Config::default()
    }

    #[test]
    fn three_trips_then_quay() {
        let cfg = config();
        assert_eq!(trips_left(0, &cfg), 3);
        assert_eq!(trips_left(3, &cfg), 0);
        assert!(can_sail(false, 2, 4, 0, &cfg));
        assert!(!can_sail(false, 3, 4, 0, &cfg));
    }

    #[test]
    fn exhausted_quota_keeps_boats_at_quay() {
        let cfg = config();
        assert_eq!(quota_left(4, 0, &cfg), 280);
        assert_eq!(quota_left(4, 280, &cfg), 0);
        assert!(!can_sail(false, 0, 4, 280, &cfg));
        assert!(!can_sail(true, 0, 4, 0, &cfg));
    }

    #[test]
    fn zone_costs_follow_section_41() {
        let cfg = config();
        assert_eq!(trip_cost(Zone::Shallows, &cfg), 200);
        assert_eq!(trip_cost(Zone::Greybank, &cfg), 400);
        assert_eq!(trip_cost(Zone::Deeps, &cfg), 700);
    }
}
