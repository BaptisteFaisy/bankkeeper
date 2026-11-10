//! NPC orders: three captains, one bank.
//!
//! Every morning each NPC captain assigns its fleet from its own reading of
//! the journal: Hale watches her four-week mean, Brandt chases yesterday's
//! best zone, Okoro copies yesterday's best captain. The bank settles its
//! notes every Monday. Each decision emits its raw reasoning string (brief
//! section 7). Buyer limits and trip prices come straight from the rules at
//! the auction; townsfolk spend their wages in the evening drain.

use crate::reading::{
    best_captain_yesterday, best_zone_yesterday, untried_zone, TRIES_EVERY, TRY_DAY,
    UNFISHED_DAYS,
};
use crate::seed::draw_below;
use crate::{fmt_gold, fmt_tenths, Game, SEIZED_BOAT_PRICE};
use rules::auction;
use rules::debt::{apply_payment, desperate_for_cash, weekly_due, Payment};
use rules::state::{ActorId, Mesh, Species, Zone};

/// Morning orders for the three NPC captains, in roster order.
pub fn decide_all(game: &mut Game) -> Vec<String> {
    let mut lines = Vec::new();
    for captain in [ActorId::Hale, ActorId::Brandt, ActorId::Okoro] {
        if game.port.stopped[captain.idx()] {
            continue;
        }
        lines.extend(decide(game, captain));
    }
    lines
}

/// One captain's dawn decision.
fn decide(game: &mut Game, captain: ActorId) -> Vec<String> {
    if game.boats_of(captain).is_empty() {
        return vec![format!("{} has no boats left.", captain.name())];
    }
    let plan = match captain {
        ActorId::Hale => hale_plan(game),
        ActorId::Brandt => brandt_plan(game),
        ActorId::Okoro => okoro_plan(game),
        _ => return Vec::new(),
    };
    let (zone, mesh, line) = crate::favours::book_kept(game, captain, plan);
    for index in game.boats_of(captain) {
        game.port.boats[index].zone = zone;
        game.port.boats[index].mesh = mesh;
    }
    vec![line]
}

/// Catch per trip in tenths, if any trip sailed.
fn cpt_tenths(crates: u64, trips: u64) -> Option<u64> {
    crates.saturating_mul(10).checked_div(trips)
}

/// Mean catch per trip in tenths over journal entries, for one captain.
fn mean_cpt_tenths(records: &[crate::DayRecord], actor: ActorId) -> Option<u64> {
    let mut crates = 0u64;
    let mut trips = 0u64;
    for record in records {
        crates += record.captain_crates[actor.idx()];
        trips += record.captain_trips[actor.idx()];
    }
    cpt_tenths(crates, trips)
}

/// Where a captain last fished (Greybank before the first outing).
fn last_fished_zone(game: &Game, actor: ActorId) -> Zone {
    game.history
        .iter()
        .rev()
        .find_map(|record| record.fished_zone[actor.idx()])
        .unwrap_or(Zone::Greybank)
}

/// First open zone, preferring Greybank (the opening ground).
fn fallback_zone(game: &Game) -> Option<Zone> {
    if !game.closed[Zone::Greybank.idx()] {
        return Some(Zone::Greybank);
    }
    Zone::all().into_iter().find(|zone| !game.closed[zone.idx()])
}

/// Hale fishes while her latest catch per trip holds above 70% of her
/// four-week mean, else she stays at the quay. Always large mesh.
fn hale_plan(game: &Game) -> (Option<Zone>, Mesh, String) {
    let boats = game.boats_of(ActorId::Hale).len() as u64;
    let zone = last_fished_zone(game, ActorId::Hale);
    let recent = game.history.last().and_then(|record| {
        cpt_tenths(
            record.captain_crates[ActorId::Hale.idx()],
            record.captain_trips[ActorId::Hale.idx()],
        )
    });
    let mean = mean_cpt_tenths(game.recent(28), ActorId::Hale);
    match (recent, mean) {
        (Some(latest), Some(average)) if latest * 10 < average * 7 => (
            None,
            Mesh::Large,
            format!(
                "Hale stays at the quay: catch per trip {}, below 70% of her average ({}).",
                fmt_tenths(latest),
                fmt_tenths(average)
            ),
        ),
        (Some(latest), Some(average)) => (
            Some(zone),
            Mesh::Large,
            format!(
                "Hale sends {boats} boats to {}: catch per trip {}, holds above 70% of her average ({}).",
                zone.name(),
                fmt_tenths(latest),
                fmt_tenths(average)
            ),
        ),
        _ => (
            Some(zone),
            Mesh::Large,
            format!("Hale sends {boats} boats to {}: first outing, no catch history yet.", zone.name()),
        ),
    }
}

/// Brandt fishes the best zone yesterday, every boat. Short of the next loan
/// instalment, the whole fleet goes out on small mesh (TW-C3-04).
fn brandt_plan(game: &Game) -> (Option<Zone>, Mesh, String) {
    let boats = game.boats_of(ActorId::Brandt).len() as u64;
    let zone = best_zone_yesterday(game).or_else(|| fallback_zone(game));
    let Some(zone) = zone else {
        return (
            None,
            Mesh::Large,
            "Brandt stays at the quay: every zone is closed.".to_string(),
        );
    };
    let due: u64 = game
        .loans
        .iter()
        .filter(|loan| loan.borrower == ActorId::Brandt)
        .map(|loan| weekly_due(loan, &game.config))
        .sum();
    let has_loan = game.loans.iter().any(|loan| loan.borrower == ActorId::Brandt);
    let gold = game.port.gold[ActorId::Brandt.idx()];
    let mut mesh = Mesh::Large;
    if has_loan && desperate_for_cash(gold, due) {
        mesh = Mesh::Small;
        if game.small_mesh_banned {
            mesh = Mesh::Large;
        }
        let days_left = game.config.days_per_week - game.port.day % game.config.days_per_week;
        let short = ((due as i64 - gold).max(0) / 100) as u64;
        let mut line = rules::debt::distress_reasoning("Brandt", days_left, short);
        if mesh == Mesh::Large {
            line.push_str(" Small mesh is banned: large mesh instead.");
        }
        return (Some(zone), mesh, line);
    }
    (
        Some(zone),
        mesh,
        format!("Brandt sends {boats} boats to {}: best catch per trip yesterday.", zone.name()),
    )
}

/// Okoro copies yesterday's best gold-per-boat captain, zone and mesh.
fn okoro_plan(game: &Game) -> (Option<Zone>, Mesh, String) {
    let boats = game.boats_of(ActorId::Okoro).len() as u64;
    if draw_below(game.port.seed, game.port.day, TRY_DAY, 0, TRIES_EVERY) == 0 {
        if let Some(zone) = untried_zone(game) {
            let weeks = UNFISHED_DAYS / game.config.days_per_week.max(1) as usize;
            return (
                Some(zone),
                Mesh::Large,
                format!("Okoro tries {}: nobody has fished it for {weeks} weeks.", zone.name()),
            );
        }
    }
    let Some(best) = best_captain_yesterday(game) else {
        let zone = fallback_zone(game);
        let name = zone.map(|zone| zone.name()).unwrap_or("nowhere");
        return (
            zone,
            Mesh::Large,
            format!("Okoro sends {boats} boats to {name}: first outing, nobody fished yesterday."),
        );
    };
    let yesterday = game.history.last().expect("best implies yesterday");
    let mut zone = yesterday.fished_zone[best.idx()];
    if zone.map(|zone| game.closed[zone.idx()]).unwrap_or(true) {
        zone = fallback_zone(game);
    }
    let mut mesh = yesterday.fished_mesh[best.idx()];
    if game.small_mesh_banned {
        mesh = Mesh::Large;
    }
    let earned = yesterday.gold_earned[best.idx()].max(0) as u64;
    let per_boat = earned / yesterday.boats_fished[best.idx()].max(1) / 100;
    let name = zone.map(|zone| zone.name()).unwrap_or("nowhere");
    (
        zone,
        mesh,
        format!("Okoro copies {}: {per_boat} gold per boat yesterday, the best in port, and sails to {name}.", best.name()),
    )
}

/// Auction view of the three buyers for one species, in canonical (tie-break)
/// order. Limits come from the stock factor inside the clearing rule.
pub fn auction_buyers(game: &Game, species: Species) -> Vec<auction::Buyer> {
    ActorId::buyers()
        .into_iter()
        .map(|buyer| auction::Buyer {
            actor: buyer,
            stock: game.port.stores[buyer.idx()][species.idx()],
            target: game.config.buyer_target(buyer, species),
            gold: game.port.gold[buyer.idx()],
            buys: game.config.buys(buyer, species),
            open: !game.port.stopped[buyer.idx()],
        })
        .collect()
}

/// Richest sailing captain able to pay `price` (canonical order wins ties).
fn richest_afloat(game: &Game, exclude: Option<ActorId>, price: u64) -> Option<ActorId> {
    let mut best: Option<(ActorId, i64)> = None;
    for captain in ActorId::captains() {
        if Some(captain) == exclude || game.port.stopped[captain.idx()] {
            continue;
        }
        let gold = game.port.gold[captain.idx()];
        if gold >= price as i64 && best.map(|(_, top)| gold > top).unwrap_or(true) {
            best = Some((captain, gold));
        }
    }
    best.map(|(captain, _)| captain)
}

/// Seize one boat: auction it to the richest sailing captain, or moor it with
/// the bank when nobody can pay. The note closes either way.
pub(crate) fn seize_boat(game: &mut Game, borrower: ActorId, holder: ActorId, boat_id: u64) -> String {
    let Some(index) = game.port.boats.iter().position(|boat| boat.id == boat_id) else {
        return format!(
            "{}'s boat {boat_id} is seized, but the hull is already gone.",
            borrower.name()
        );
    };
    match richest_afloat(game, Some(borrower), SEIZED_BOAT_PRICE) {
        Some(buyer) => {
            game.port.gold[buyer.idx()] -= SEIZED_BOAT_PRICE as i64;
            game.port.gold[holder.idx()] += SEIZED_BOAT_PRICE as i64;
            game.port.boats[index].owner = buyer;
            game.port.boats[index].zone = None;
            format!(
                "{}'s boat {boat_id} is seized and auctioned to {} for {}.",
                borrower.name(),
                buyer.name(),
                fmt_gold(SEIZED_BOAT_PRICE as i64)
            )
        }
        None => {
            game.port.boats[index].owner = ActorId::Bank;
            game.port.boats[index].zone = None;
            format!(
                "{}'s boat {boat_id} is seized; no buyer, the bank holds the hull.",
                borrower.name()
            )
        }
    }
}

/// Bank-held hulls go back on the block every Monday.
fn reauction_bank_boats(game: &mut Game) -> Vec<String> {
    let mut lines = Vec::new();
    let hulls: Vec<u64> = game
        .port
        .boats
        .iter()
        .filter(|boat| boat.owner == ActorId::Bank)
        .map(|boat| boat.id)
        .collect();
    for boat_id in hulls {
        let Some(buyer) = richest_afloat(game, None, SEIZED_BOAT_PRICE) else {
            continue;
        };
        game.port.gold[buyer.idx()] -= SEIZED_BOAT_PRICE as i64;
        game.port.gold[ActorId::Bank.idx()] += SEIZED_BOAT_PRICE as i64;
        let index = game
            .port
            .boats
            .iter()
            .position(|boat| boat.id == boat_id)
            .expect("hull exists");
        game.port.boats[index].owner = buyer;
        lines.push(format!(
            "{} buys bank-held boat {boat_id} for {}.",
            buyer.name(),
            fmt_gold(SEIZED_BOAT_PRICE as i64)
        ));
    }
    lines
}

/// Settle every note for the week: full instalments advance, short ones count
/// missed, the second miss seizes the hull (TW-C3-03).
pub(crate) fn settle_loans(game: &mut Game) -> Vec<String> {
    let mut lines = Vec::new();
    let ids: Vec<u64> = game.loans.iter().map(|loan| loan.id).collect();
    for id in ids {
        let loan_at = game.loans.iter().position(|loan| loan.id == id).expect("note exists");
        let borrower = game.loans[loan_at].borrower;
        let holder = game.loans[loan_at].holder;
        let due = weekly_due(&game.loans[loan_at], &game.config);
        let paid = (game.port.gold[borrower.idx()].max(0) as u64).min(due);
        game.port.gold[borrower.idx()] -= paid as i64;
        game.port.gold[holder.idx()] += paid as i64;
        let outcome = {
            let loan = &mut game.loans[loan_at];
            apply_payment(loan, paid, &game.config)
        };
        match outcome {
            Payment::PaidOff => {
                game.loans.remove(loan_at);
                lines.push(format!("{} clears loan {id}.", borrower.name()));
            }
            Payment::Current => {
                lines.push(format!("{} pays {} on loan {id}.", borrower.name(), fmt_gold(paid as i64)));
            }
            Payment::Missed => {
                let missed = game.loans[loan_at].missed;
                lines.push(format!("{} misses a payment on loan {id} ({missed} missed).", borrower.name()));
            }
            Payment::Seized => {
                let hull = game.loans[loan_at].boat;
                game.loans.remove(loan_at);
                lines.push(seize_boat(game, borrower, holder, hull));
            }
        }
    }
    lines.extend(reauction_bank_boats(game));
    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{seed_game, DayRecord};

    fn fished_yesterday(game: &mut Game, captain: ActorId, zone: Zone, crates: u64, trips: u64) {
        let mut record = DayRecord::new(game.port.day);
        record.trips[zone.idx()] = trips;
        record.crates[zone.idx()] = crates;
        record.captain_trips[captain.idx()] = trips;
        record.captain_crates[captain.idx()] = crates;
        record.boats_fished[captain.idx()] = 1;
        record.gold_earned[captain.idx()] = crates as i64 * 400;
        record.fished_zone[captain.idx()] = Some(zone);
        game.history.push(record);
    }

    #[test]
    fn hale_quays_below_70_percent_of_mean() {
        let mut game = seed_game(3);
        for _ in 0..4 {
            fished_yesterday(&mut game, ActorId::Hale, Zone::Greybank, 100, 10);
        }
        fished_yesterday(&mut game, ActorId::Hale, Zone::Greybank, 60, 10);
        let (zone, _, line) = hale_plan(&game);
        assert_eq!(zone, None);
        assert!(line.contains("stays at the quay"), "{line}");
    }

    #[test]
    fn brandt_chases_yesterday_best_zone() {
        let mut game = seed_game(3);
        game.port.gold[ActorId::Brandt.idx()] = 5_000;
        let mut record = DayRecord::new(0);
        record.trips = [6, 6, 0];
        record.crates = [90, 60, 0];
        game.history.push(record);
        let (zone, mesh, line) = brandt_plan(&game);
        assert_eq!(zone, Some(Zone::Shallows));
        assert_eq!(mesh, Mesh::Small, "Brandt is short for the 96 gold due: {line}");
        assert!(line.contains("small mesh"), "{line}");
    }

    /// First day where the follower's seeded draw says "copy today".
    fn copy_day(seed: u64) -> u64 {
        (0..64)
            .find(|day| draw_below(seed, *day, TRY_DAY, 0, TRIES_EVERY) != 0)
            .expect("some day is a copying day")
    }

    /// First day where the follower's seeded draw says "try somewhere new".
    fn try_day(seed: u64) -> u64 {
        (0..64)
            .find(|day| draw_below(seed, *day, TRY_DAY, 0, TRIES_EVERY) == 0)
            .expect("one day in five is a trying day")
    }

    #[test]
    fn okoro_copies_the_best_gold_per_boat() {
        let mut game = seed_game(3);
        game.port.day = copy_day(3);
        fished_yesterday(&mut game, ActorId::Brandt, Zone::Deeps, 40, 4);
        let (zone, _, line) = okoro_plan(&game);
        assert_eq!(zone, Some(Zone::Deeps));
        assert!(line.contains("copies Brandt"), "{line}");
    }

    #[test]
    fn okoro_tries_a_ground_nobody_fishes() {
        let mut game = seed_game(3);
        game.port.day = try_day(3);
        fished_yesterday(&mut game, ActorId::Brandt, Zone::Greybank, 40, 4);
        let (zone, mesh, line) = okoro_plan(&game);
        assert!(zone.is_some_and(|zone| zone != Zone::Greybank), "{zone:?} {line}");
        assert_eq!(mesh, Mesh::Large, "a try is never on small mesh");
        assert!(line.contains("nobody has fished it"), "{line}");
    }

    #[test]
    fn two_missed_weeks_seize_the_hull() {
        let mut game = seed_game(3);
        game.port.gold[ActorId::Brandt.idx()] = 0;
        let first = settle_loans(&mut game);
        assert!(first.iter().any(|line| line.contains("misses")), "{first:?}");
        let second = settle_loans(&mut game);
        assert!(second.iter().any(|line| line.contains("seized")), "{second:?}");
        assert!(game.loans.is_empty());
    }
}
