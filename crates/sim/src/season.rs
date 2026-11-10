//! Weeks and seasons: quotas reset, notes settle, the council sits.
//!
//! Every Monday the weekly catches reset, the mesh ledger takes the week's
//! pressure, captains trade licences, the bank settles its notes, broke
//! captains lay up and pooled licences go back on the block. Every fourth
//! Monday the captains vote next season's rules, one vote per licence.

use crate::{favours, fmt_gold, Game};
use rules::bankruptcy::{broke_captains, lay_up};
use rules::council::{indemnity_cost, npc_vote, tally, vote_reasoning, Proposal, Tally, Vote};
use rules::licences::{
    cap_reached, leased_out, sellable_licences, should_buy_licence, should_sell_licence,
    trade_licences,
};
use rules::trips::quota_left;
use rules::state::{ActorId, Zone};
use rules::debt::weekly_due;
use serde::{Deserialize, Serialize};

/// Season-end vote and its outcome, for the journal and the judges.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CouncilReport {
    pub season: u64,
    pub proposal: Proposal,
    /// True only when a real motion was tabled and voted (B2).
    #[serde(default)]
    pub tabled: bool,
    pub ballots: Vec<(ActorId, Vote, u64)>,
    pub tally: Tally,
    pub lines: Vec<String>,
}

/// Season-end bilan (brief 2.3 step 6): player net worth, real stocks.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bilan {
    /// Purse + licences at the going price + hulls at the new-boat price.
    pub net_worth: i64,
    pub gold: i64,
    pub licences: u64,
    pub licence_price: u64,
    pub boats: u64,
    /// Real zone stocks (judges only; hidden from the player all season).
    pub stocks: [u64; 3],
}

/// Monday settlement. Order matters: trades and payments can still rescue a
/// captain before the lay-up check; pooled licences sell after.
pub fn roll_week(game: &mut Game, closures: &mut Vec<ActorId>) -> Vec<String> {
    let mut lines = Vec::new();
    game.mesh.record_week(game.week_small, game.week_total);
    game.week_small = [0; 3];
    game.week_total = [0; 3];
    lines.extend(game.settle_leases());
    lines.extend(trade_licences_week(game));
    lines.extend(crate::bots::settle_loans(game));
    for captain in broke_captains(&game.port) {
        lines.extend(game.drop_leases(captain));
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

/// Pair off NPC sellers and buyers at the going price (TW-N-22). Ownership
/// drives the ceiling and the sell trigger; the fishing count drives the buy
/// trigger, since that is the quota a captain actually works with.
fn match_licence_traders(game: &Game, price: u64) -> (Vec<ActorId>, Vec<ActorId>) {
    let mut sellers = Vec::new();
    let mut buyers = Vec::new();
    for captain in [ActorId::Hale, ActorId::Brandt, ActorId::Okoro] {
        if game.port.stopped[captain.idx()] {
            continue;
        }
        let held = game.port.licences[captain.idx()];
        let owned = game.owned_licences(captain);
        let gold = game.port.gold[captain.idx()];
        let free = sellable_licences(owned, leased_out(&game.leases, captain));
        if free > 0 && should_sell_licence(gold, licence_reserve(game, captain), owned) {
            sellers.push(captain);
        } else if cap_reached(owned, game.config.licence_cap_per_captain, 1) {
            continue;
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
    let cap = game.config.licence_cap_per_captain;
    while game.port.licence_pool > 0 {
        let mut best: Option<(ActorId, i64)> = None;
        for captain in ActorId::captains() {
            if game.port.stopped[captain.idx()] {
                continue;
            }
            // The ceiling on the block, like every other licence path: a
            // captain at the cap takes no pooled licence (brief 13 q3).
            if cap_reached(game.port.licences[captain.idx()], cap, 1) {
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
    let Some(proposal) = game.proposal.take() else {
        return no_motion_report(game, season);
    };
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
        tabled: true,
        ballots,
        tally: result,
        lines,
    }
}

/// Honest no-motion council (B2): no ballot is polled, the tally is zero,
/// the standing rules continue untouched.
fn no_motion_report(game: &Game, season: u64) -> CouncilReport {
    CouncilReport {
        season,
        proposal: status_quo(game),
        tabled: false,
        ballots: Vec::new(),
        tally: tally(&[]),
        lines: vec![format!(
            "Council of season {season}: no motion tabled; the standing rules continue."
        )],
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
        let held = game.owned_licences(captain);
        if captain == ActorId::You {
            let ballot = player_ballot(game.player_vote);
            ballots.push((captain, ballot, held));
            lines.push(player_ballot_line(ballot));
            continue;
        }
        let pass = season_profit(game, captain, proposal.quota_per_licence, proposal.close_zone, proposal.ban_small_mesh);
        let fail = season_profit(game, captain, game.config.quota_per_licence, None, game.small_mesh_banned);
        let base = npc_vote(pass, fail, held, proposal.indemnity_per_licence_week, game.config.weeks_per_season);
        let weekly_cost = (((fail - pass).max(0) / game.config.weeks_per_season as i64) / 100).max(0) as u64;
        let offer = proposal.indemnity_per_licence_week.saturating_mul(held) / 100;
        // The moral book bends the economic ballot; the clause says so.
        let book = game.favour(captain);
        // Reasons print gold; the vote compares centigold with centigold.
        let season_offer = offer.saturating_mul(game.config.weeks_per_season).saturating_mul(100) as i64;
        let vote = favours::court_vote(base, book.score, &game.config, pass, fail, season_offer);
        ballots.push((captain, vote, held));
        lines.push(format!(
            "{}{}",
            vote_reasoning(captain.name(), vote, proposal.quota_per_licence, weekly_cost, offer),
            book.clause(&game.config)
        ));
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

/// Close the season (B5): after the council has rolled, flag the game over
/// and attach the bilan to both the game and the day report.
pub fn close_season(game: &mut Game, report: &mut crate::cycle::DayReport) {
    let bilan = season_bilan(game);
    game.over = true;
    game.bilan = Some(bilan.clone());
    report.season_over = true;
    report.bilan = Some(bilan);
}

/// Open the next season of the campaign (brief section 13, question 4).
///
/// The harbour keeps everything the player built — purse, licences, hulls,
/// notes, standing rules — and the **sea keeps what the season left it**: the
/// stocks are not reset. That is the handicap: a season fished hard makes the
/// next one poorer, without a single artificial penalty. Only the season flag,
/// the pending motion and the ballot are cleared.
pub fn open_next_season(game: &mut Game) -> Result<u64, String> {
    if !game.over {
        return Err("the season is still running".to_string());
    }
    // Archive the bilan of the season just closed, but never past the number
    // of seasons the campaign has: the entry is written once, whether the
    // call goes on or refuses. No click can add a ghost season to the log.
    let seasons = game.config.campaign_seasons as usize;
    if game.campaign.len() < seasons {
        if let Some(bilan) = game.bilan.clone() {
            game.campaign.push(bilan);
        }
    }
    if game.campaign.len() >= seasons {
        game.over = true;
        return Err("campaign over".to_string());
    }
    game.over = false;
    game.bilan = None;
    game.proposal = None;
    game.player_vote = None;
    Ok(game.port.season(&game.config) + 1)
}

/// Player net worth at season end: purse + licences at the going price +
/// hulls at the new-boat price, with the real zone stocks (all centigold).
pub fn season_bilan(game: &Game) -> Bilan {
    let licences = game.owned_licences(ActorId::You);
    let price = game.licence_price_now();
    let boats = game.boats_of(ActorId::You).len() as i64;
    let gold = game.port.gold[ActorId::You.idx()];
    let worth = gold + licences as i64 * price as i64 + boats * game.config.new_boat_cost as i64;
    Bilan {
        net_worth: worth,
        gold,
        licences,
        licence_price: price,
        boats: boats as u64,
        stocks: game.port.stocks,
    }
}
