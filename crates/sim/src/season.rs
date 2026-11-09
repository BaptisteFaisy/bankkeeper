//! Weeks and seasons: quotas reset, notes settle, the council sits.
//!
//! Every Monday the weekly catches reset, the mesh ledger takes the week's
//! pressure, captains trade licences, the bank settles its notes, broke
//! captains lay up and pooled licences go back on the block. Every fourth
//! Monday the captains vote next season's rules, one vote per licence.

use crate::{fmt_gold, Game};
use rules::bankruptcy::{broke_captains, lay_up};
use rules::council::{indemnity_cost, npc_vote, tally, vote_reasoning, Proposal, Tally, Vote};
use rules::licences::{should_buy_licence, should_sell_licence, trade_licences};
use rules::trips::quota_left;
use rules::state::{ActorId, Zone};
use rules::debt::weekly_due;
use serde::{Deserialize, Serialize};

/// Season-end vote and its outcome, for the journal and the judges.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CouncilReport {
    pub season: u64,
    pub proposal: Proposal,
    pub ballots: Vec<(ActorId, Vote, u64)>,
    pub tally: Tally,
    pub lines: Vec<String>,
}

/// Monday settlement. Order matters: trades and payments can still rescue a
/// captain before the lay-up check; pooled licences sell after.
pub fn roll_week(game: &mut Game, closures: &mut Vec<ActorId>) -> Vec<String> {
    let mut lines = Vec::new();
    game.mesh.record_week(game.week_small, game.week_total);
    game.week_small = [0; 3];
    game.week_total = [0; 3];
    lines.extend(trade_licences_week(game));
    lines.extend(crate::bots::settle_loans(game));
    for captain in broke_captains(&game.port) {
        let pooled = game.port.licences[captain.idx()];
        lay_up(&mut game.port, captain);
        closures.push(captain);
        lines.push(format!(
            "{} lays up its boats (broke); {pooled} licences to the pool.",
            captain.name()
        ));
    }
    lines.extend(auction_pool(game));
    game.port.weekly_catch = [0; 10];
    lines
}

/// Gold a captain wants in hand before selling a licence: two weeks of crew
/// wages plus next week's instalments.
fn licence_reserve(game: &Game, captain: ActorId) -> i64 {
    let boats = game.boats_of(captain).len() as u64;
    let wages = rules::debt::daily_charges(boats, &game.config) * 14;
    let dues: u64 = game
        .loans
        .iter()
        .filter(|loan| loan.borrower == captain)
        .map(|loan| weekly_due(loan, &game.config))
        .sum();
    (wages + dues) as i64
}

/// NPC licence trades (TW-N-22): short captains sell down to their last
/// licence, quota-capped captains with ready boats buy. The player trades by
/// hand through the relay.
fn trade_licences_week(game: &mut Game) -> Vec<String> {
    let mut lines = Vec::new();
    let price = game.licence_price_now();
    let (sellers, buyers) = match_licence_traders(game, price);
    for (seller, buyer) in sellers.into_iter().zip(buyers) {
        lines.push(settle_licence_trade(game, seller, buyer, price));
    }
    lines
}

/// Pair off NPC sellers and buyers at the going price (TW-N-22).
fn match_licence_traders(game: &Game, price: u64) -> (Vec<ActorId>, Vec<ActorId>) {
    let mut sellers = Vec::new();
    let mut buyers = Vec::new();
    for captain in [ActorId::Hale, ActorId::Brandt, ActorId::Okoro] {
        if game.port.stopped[captain.idx()] {
            continue;
        }
        let held = game.port.licences[captain.idx()];
        let gold = game.port.gold[captain.idx()];
        if should_sell_licence(gold, licence_reserve(game, captain), held) {
            sellers.push(captain);
        } else if should_buy_licence(
            quota_left(held, game.port.weekly_catch[captain.idx()], &game.config),
            game.boats_of(captain).len() as u64,
            gold,
            price,
        ) {
            buyers.push(captain);
        }
    }
    (sellers, buyers)
}

/// Move one licence from seller to buyer and journal the trade.
fn settle_licence_trade(game: &mut Game, seller: ActorId, buyer: ActorId, price: u64) -> String {
    let result = trade_licences(
        game.port.licences[seller.idx()],
        game.port.licences[buyer.idx()],
        game.port.gold[seller.idx()],
        game.port.gold[buyer.idx()],
        1,
        price,
    );
    match result {
        Ok((_, (seller_left, buyer_left, seller_gold, buyer_gold))) => {
            game.port.licences[seller.idx()] = seller_left;
            game.port.licences[buyer.idx()] = buyer_left;
            game.port.gold[seller.idx()] = seller_gold;
            game.port.gold[buyer.idx()] = buyer_gold;
            format!(
                "{} sells a licence to {} for {}.",
                seller.name(),
                buyer.name(),
                fmt_gold(price as i64)
            )
        }
        Err(error) => format!("{} cannot sell to {}: {error:?}.", seller.name(), buyer.name()),
    }
}

/// Pooled licences (TW-N-50) go to the richest sailing captain first, at the
/// going price; the bank takes the proceeds as creditor.
fn auction_pool(game: &mut Game) -> Vec<String> {
    let mut lines = Vec::new();
    let price = game.licence_price_now();
    while game.port.licence_pool > 0 {
        let mut best: Option<(ActorId, i64)> = None;
        for captain in ActorId::captains() {
            if game.port.stopped[captain.idx()] {
                continue;
            }
            let gold = game.port.gold[captain.idx()];
            if gold >= price as i64 && best.map(|(_, top)| gold > top).unwrap_or(true) {
                best = Some((captain, gold));
            }
        }
        let Some((buyer, _)) = best else {
            break;
        };
        game.port.licence_pool -= 1;
        game.port.licences[buyer.idx()] += 1;
        game.port.gold[buyer.idx()] -= price as i64;
        game.port.gold[ActorId::Bank.idx()] += price as i64;
        lines.push(format!(
            "{} buys a pooled licence for {}.",
            buyer.name(),
            fmt_gold(price as i64)
        ));
    }
    lines
}

/// Status-quo motion: current quota, nothing closed, mesh as-is, no indemnity.
fn status_quo(game: &Game) -> Proposal {
    Proposal {
        quota_per_licence: game.config.quota_per_licence,
        close_zone: None,
        ban_small_mesh: game.small_mesh_banned,
        indemnity_per_licence_week: 0,
    }
}

/// A captain's own reading of next season's catch per trip, in tenths:
/// Hale her four-week mean, Brandt the best zone last week, Okoro the whole
/// fleet last week (TW-C1-04).
fn own_cpt_tenths(game: &Game, captain: ActorId) -> u64 {
    match captain {
        ActorId::Hale => {
            let mut crates = 0u64;
            let mut trips = 0u64;
            for record in game.recent(28) {
                crates += record.captain_crates[captain.idx()];
                trips += record.captain_trips[captain.idx()];
            }
            cpt_or_fallback(game, crates, trips)
        }
        ActorId::Brandt => best_zone_cpt(game),
        _ => fleet_cpt(game),
    }
}

/// Mean tenths, falling back to the fleet signal, then to 10 crates a trip.
fn cpt_or_fallback(game: &Game, crates: u64, trips: u64) -> u64 {
    if let Some(cpt) = crates.saturating_mul(10).checked_div(trips) {
        return cpt;
    }
    let fleet = fleet_cpt(game);
    if fleet > 0 {
        fleet
    } else {
        100
    }
}

/// Best open-zone weekly catch per trip in tenths (Brandt's reading).
fn best_zone_cpt(game: &Game) -> u64 {
    let mut trips = [0u64; 3];
    let mut crates = [0u64; 3];
    for record in game.recent(7) {
        for zone in Zone::all() {
            trips[zone.idx()] += record.trips[zone.idx()];
            crates[zone.idx()] += record.crates[zone.idx()];
        }
    }
    let mut best = 0u64;
    for zone in Zone::all() {
        if game.closed[zone.idx()] || trips[zone.idx()] == 0 {
            continue;
        }
        best = best.max(crates[zone.idx()].saturating_mul(10) / trips[zone.idx()]);
    }
    if best > 0 {
        best
    } else {
        100
    }
}

/// Fleet-wide weekly catch per trip in tenths (Okoro's reading).
fn fleet_cpt(game: &Game) -> u64 {
    let mut trips = 0u64;
    let mut crates = 0u64;
    for record in game.recent(7) {
        trips += record.trips.iter().sum::<u64>();
        crates += record.crates.iter().sum::<u64>();
    }
    crates.saturating_mul(10).checked_div(trips).unwrap_or(0)
}

/// Expected season profit under quota/closure/ban rules, on the captain's own
/// catch reading and last week's crate price.
fn season_profit(
    game: &Game,
    captain: ActorId,
    quota: u64,
    close_zone: Option<Zone>,
    ban_small_mesh: bool,
) -> i64 {
    let boats = game.boats_of(captain).len() as u64;
    let mut cpt = own_cpt_tenths(game, captain);
    let uses_small = game
        .boats_of(captain)
        .into_iter()
        .any(|index| game.port.boats[index].mesh == rules::state::Mesh::Small);
    if ban_small_mesh && uses_small {
        cpt = cpt.saturating_mul(10) / 14;
    }
    let price = game.last_week_crate_price().unwrap_or(game.config.base_herring);
    let (share_num, share_den) = match close_zone {
        None => (1, 1),
        Some(_) => (2, 3),
    };
    let fishable = boats * 7 * 3 * cpt / 10 * share_num / share_den;
    let allowance = game.port.licences[captain.idx()] * quota;
    let revenue = fishable.min(allowance) as i64 * price as i64;
    let wages = rules::debt::daily_charges(boats, &game.config) * 7;
    let dues: u64 = game
        .loans
        .iter()
        .filter(|loan| loan.borrower == captain)
        .map(|loan| weekly_due(loan, &game.config))
        .sum();
    (revenue - (wages + dues) as i64) * game.config.weeks_per_season as i64
}

/// Season-end council (TW-C4): every sailing captain votes its own profit,
/// the player backs its own motion, strict licence majority carries.
pub fn roll_season(game: &mut Game) -> CouncilReport {
    let season = game.port.season(&game.config);
    let proposal = game.proposal.take().unwrap_or_else(|| status_quo(game));
    let mut ballots = Vec::new();
    let mut lines = Vec::new();
    lines.push(format!(
        "Council of season {season}: quota {}, {}, {}.",
        proposal.quota_per_licence,
        proposal.close_zone.map(|zone| format!("{} closed", zone.name())).unwrap_or_else(|| "no closure".to_string()),
        if proposal.ban_small_mesh { "small mesh banned" } else { "mesh open" }
    ));
    poll_captains(game, &proposal, &mut ballots, &mut lines);
    let result = tally(&ballots);
    lines.push(format!(
        "Tally: {} for, {} against; the motion {}.",
        result.for_votes,
        result.against_votes,
        if result.passed { "passes" } else { "fails" }
    ));
    if result.passed {
        apply_proposal(game, &proposal, &ballots, &mut lines);
    }
    CouncilReport {
        season,
        proposal,
        ballots,
        tally: result,
        lines,
    }
}

/// Poll every sailing captain: the player backs its own motion, each NPC
/// votes its own profit, indemnity included (TW-C4-02).
fn poll_captains(
    game: &Game,
    proposal: &Proposal,
    ballots: &mut Vec<(ActorId, Vote, u64)>,
    lines: &mut Vec<String>,
) {
    for captain in ActorId::captains() {
        if game.port.stopped[captain.idx()] {
            continue;
        }
        let held = game.port.licences[captain.idx()];
        if captain == ActorId::You {
            let ballot = player_ballot(game.player_vote);
            ballots.push((captain, ballot, held));
            lines.push(player_ballot_line(ballot));
            continue;
        }
        let pass = season_profit(game, captain, proposal.quota_per_licence, proposal.close_zone, proposal.ban_small_mesh);
        let fail = season_profit(game, captain, game.config.quota_per_licence, None, game.small_mesh_banned);
        let vote = npc_vote(pass, fail, held, proposal.indemnity_per_licence_week, game.config.weeks_per_season);
        let weekly_cost = (((fail - pass).max(0) / game.config.weeks_per_season as i64) / 100).max(0) as u64;
        let offer = proposal.indemnity_per_licence_week.saturating_mul(held) / 100;
        ballots.push((captain, vote, held));
        lines.push(vote_reasoning(captain.name(), vote, proposal.quota_per_licence, weekly_cost, offer));
    }
}

/// The player's ballot: an explicit no stands, silence backs the motion.
fn player_ballot(vote: Option<bool>) -> Vote {
    match vote {
        Some(false) => Vote::Against,
        _ => Vote::For,
    }
}

/// Reasoning line for the player's ballot (TW-C4-05).
fn player_ballot_line(ballot: Vote) -> String {
    match ballot {
        Vote::For => "You vote yes: your own motion.".to_string(),
        Vote::Against => "You vote no: against the motion.".to_string(),
    }
}

/// Carry a passed motion: new quota, closure, mesh ban, and the indemnity bill
/// paid upfront by the proposer to the yes-voters.
fn apply_proposal(
    game: &mut Game,
    proposal: &Proposal,
    ballots: &[(ActorId, Vote, u64)],
    lines: &mut Vec<String>,
) {
    game.config.quota_per_licence = proposal.quota_per_licence;
    game.closed = [false; 3];
    if let Some(zone) = proposal.close_zone {
        game.closed[zone.idx()] = true;
        for boat in game.port.boats.iter_mut().filter(|boat| boat.zone == Some(zone)) {
            boat.zone = None;
        }
    }
    game.small_mesh_banned = proposal.ban_small_mesh;
    if proposal.ban_small_mesh {
        for boat in game.port.boats.iter_mut() {
            boat.mesh = rules::state::Mesh::Large;
        }
    }
    let for_licences: u64 = ballots
        .iter()
        .filter(|(voter, vote, _)| *voter != ActorId::You && *vote == Vote::For)
        .map(|(_, _, held)| held)
        .sum();
    let cost = indemnity_cost(for_licences, proposal.indemnity_per_licence_week, game.config.weeks_per_season);
    if cost > 0 {
        game.port.gold[ActorId::You.idx()] -= cost as i64;
        for (voter, vote, held) in ballots {
            if *voter != ActorId::You && *vote == Vote::For {
                let share = indemnity_cost(*held, proposal.indemnity_per_licence_week, game.config.weeks_per_season);
                game.port.gold[voter.idx()] += share as i64;
            }
        }
        lines.push(format!("You pay {} in indemnities.", fmt_gold(cost as i64)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{seed_game, DayRecord};

    fn week_old(game: &mut Game) {
        for day in 0..7 {
            let mut record = DayRecord::new(day);
            record.trips = [3, 9, 3];
            record.crates = [30, 90, 18];
            record.lot_price_sum = 138 * 400;
            record.lot_crates = 138;
            game.history.push(record);
        }
        game.port.day = 7;
    }

    #[test]
    fn monday_resets_quotas_and_records_mesh() {
        let mut game = seed_game(5);
        game.port.weekly_catch[ActorId::Hale.idx()] = 200;
        game.week_small = [10, 0, 0];
        game.week_total = [100, 0, 0];
        let mut closures = Vec::new();
        roll_week(&mut game, &mut closures);
        assert_eq!(game.port.weekly_catch, [0; 10]);
        assert_eq!(game.mesh.share_bps(Zone::Shallows), 1000);
        assert!(closures.is_empty());
    }

    #[test]
    fn broke_captain_lays_up_and_pools_licences() {
        let mut game = seed_game(5);
        game.port.gold[ActorId::Brandt.idx()] = 0;
        let mut closures = Vec::new();
        roll_week(&mut game, &mut closures);
        assert_eq!(closures, vec![ActorId::Brandt]);
        assert_eq!(game.port.total_licences(), 20);
    }

    #[test]
    fn fat_indemnity_flips_a_vote_and_pays() {
        let mut game = seed_game(5);
        week_old(&mut game);
        game.port.gold[ActorId::You.idx()] = 10_000_000;
        game.propose(Proposal {
            quota_per_licence: 10,
            close_zone: None,
            ban_small_mesh: false,
            indemnity_per_licence_week: 50_000,
        });
        let report = roll_season(&mut game);
        assert!(report.tally.passed, "{:?}", report.lines);
        assert!(report.lines.iter().any(|line| line.contains("votes yes")), "{:?}", report.lines);
        assert_eq!(game.config.quota_per_licence, 10);
    }

    #[test]
    fn status_quo_keeps_the_rules() {
        let mut game = seed_game(5);
        week_old(&mut game);
        let report = roll_season(&mut game);
        assert!(report.tally.passed);
        assert_eq!(game.config.quota_per_licence, 70);
    }
}
