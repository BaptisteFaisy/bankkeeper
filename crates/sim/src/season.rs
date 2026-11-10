//! Weeks and seasons: quotas reset, notes settle, the council sits.
//!
//! Every Monday the weekly catches reset, the mesh ledger takes the week's
//! pressure, captains trade licences, the bank settles its notes, broke
//! captains lay up and pooled licences go back on the block. Every fourth
//! Monday the captains vote next season's rules, one vote per licence.

use crate::{favours, fmt_gold, fund, govern, Game};
use rules::bankruptcy::{broke_captains, lay_up};
use rules::council::{npc_vote, tally, Funding, Proposal, Tally, Vote};
use rules::licences::{cap_reached, leased_out, sellable_licences, should_buy_licence, should_sell_licence, trade_licences};
use rules::trips::quota_left;
use rules::state::ActorId;
use rules::debt::weekly_due;
use serde::{Deserialize, Serialize};

/// Season-end vote and its outcome, for the journal and the judges.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CouncilReport {
    pub season: u64,
    pub proposal: Proposal,
    /// True only when a real motion was tabled and voted (B2). Barreau 3: a
    /// motion the port cannot pay for is not tabled at all.
    #[serde(default)]
    pub tabled: bool,
    /// Barreau 3: why the motion never reached the floor, when it did not.
    #[serde(default)]
    pub tabled_reason: Option<String>,
    /// Barreau 3: the bill the motion carries over the season, centigold —
    /// every licence that could vote yes, so the worst case it promises.
    #[serde(default)]
    pub indemnity_cost: u64,
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
    /// Barreau 4: what this season alone took above the sustainable catch,
    /// in crates. The season's own line of the bill.
    #[serde(default)]
    pub sea_debt: u64,
    /// Barreau 4: the whole liability the campaign carries, this season
    /// included, in crates. The second column of the bilan.
    #[serde(default)]
    pub sea_debt_total: u64,
}

/// Monday settlement. Order matters: trades and payments can still rescue a
/// captain before the lay-up check; pooled licences sell after.
pub fn roll_week(game: &mut Game, closures: &mut Vec<ActorId>) -> Vec<String> {
    let mut lines = Vec::new();
    game.mesh.record_week(game.week_small, game.week_total);
    game.week_small = [0; 3];
    game.week_total = [0; 3];
    lines.extend(game.settle_leases());
    // Barreau 3: the indemnity a carried motion owes, one week at a time.
    lines.extend(govern::pay_week(game));
    // Barreau 4: one week of every fallow passes, and the zone stays shut.
    lines.extend(game.run_fallow_week());
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
        funding: None,
        levy_per_crate: None,
    }
}

/// Season-end council (TW-C4): every sailing captain votes its own profit,
/// the player backs its own motion, strict licence majority carries.
pub fn roll_season(game: &mut Game) -> CouncilReport {
    let season = game.port.season(&game.config);
    let Some(proposal) = game.proposal.take() else {
        return no_motion_report(game, season);
    };
    // Barreau 3: a promise the port cannot keep is irreceivable, and the
    // minutes say so — it is never voted down in silence.
    let bill = match govern::admission(game, &proposal) {
        Ok(bill) => bill,
        Err(reason) => return irreceivable_report(season, proposal, reason),
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
        tabled_reason: None,
        indemnity_cost: bill,
        ballots,
        tally: result,
        lines,
    }
}

/// A motion carrying money the port does not have (barreau 3): the council
/// records it as irreceivable and the standing rules continue.
fn irreceivable_report(season: u64, proposal: Proposal, reason: String) -> CouncilReport {
    CouncilReport {
        season,
        proposal,
        tabled: false,
        tabled_reason: Some(reason.clone()),
        indemnity_cost: 0,
        ballots: Vec::new(),
        tally: tally(&[]),
        lines: vec![format!(
            "Council of season {season}: the motion is not tabled — {reason}."
        )],
    }
}

/// Honest no-motion council (B2): no ballot is polled, the tally is zero,
/// the standing rules continue untouched.
fn no_motion_report(game: &Game, season: u64) -> CouncilReport {
    CouncilReport {
        season,
        proposal: status_quo(game),
        tabled: false,
        tabled_reason: None,
        indemnity_cost: 0,
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
        let next_levy = proposal.levy_per_crate.unwrap_or(game.config.levy_per_crate);
        let pass = crate::reading::season_profit(game, captain, proposal.quota_per_licence, proposal.close_zone, proposal.ban_small_mesh, next_levy);
        let fail = crate::reading::season_profit(game, captain, game.config.quota_per_licence, None, game.small_mesh_banned, game.config.levy_per_crate);
        let base = npc_vote(pass, fail, held, proposal.indemnity_per_licence_week, game.config.weeks_per_season);
        let weekly_cost = (((fail - pass).max(0) / game.config.weeks_per_season as i64) / 100).max(0) as u64;
        let offer = proposal.indemnity_per_licence_week.saturating_mul(held) / 100;
        // The moral book bends the economic ballot; the clause says so.
        let book = game.favour(captain);
        // Reasons print gold; the vote compares centigold with centigold.
        let season_offer = offer.saturating_mul(game.config.weeks_per_season).saturating_mul(100) as i64;
        let vote = favours::court_vote(base, book.score, &game.config, pass, fail, season_offer);
        ballots.push((captain, vote, held));
        // Barreau 3: the vote carries the proof — what he took this season.
        let line = govern::with_took(game, captain, fund::vote_line(captain, vote, proposal, weekly_cost, offer));
        lines.push(format!("{line}{}", book.clause(&game.config)));
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
fn apply_proposal(game: &mut Game, proposal: &Proposal, ballots: &[(ActorId, Vote, u64)], lines: &mut Vec<String>) {
    game.config.quota_per_licence = proposal.quota_per_licence;
    if let Some(levy) = proposal.levy_per_crate {
        game.apply_levy(levy, lines);
    }
    game.closed = [false; 3];
    if let Some(zone) = proposal.close_zone {
        game.closed[zone.idx()] = true;
        for boat in game.port.boats.iter_mut().filter(|boat| boat.zone == Some(zone)) {
            boat.zone = None;
        }
    }
    // Barreau 4: a fallow outlives the council — a resting zone stays shut
    // even when the new season's motion reopens every other ground.
    for zone in rules::state::Zone::all() {
        if game.fallow_left(zone) > 0 {
            game.closed[zone.idx()] = true;
        }
    }
    game.small_mesh_banned = proposal.ban_small_mesh;
    if proposal.ban_small_mesh {
        for boat in game.port.boats.iter_mut() {
            boat.mesh = rules::state::Mesh::Large;
        }
    }
    // Barreau 3: the promise now has a payer. An extra levy pays as the
    // landings land, so the rate goes up before the payroll starts.
    if proposal.funding() == Some(Funding::Levies) && proposal.indemnity_per_licence_week > 0 {
        let bill = govern::motion_bill(game, proposal);
        let extra = govern::extra_levy_per_crate(game, bill);
        if extra > 0 {
            let raised = game.config.levy_per_crate.saturating_add(extra);
            game.config.levy_per_crate = raised;
            lines.push(format!(
                "Levy raised to {} a crate to pay the indemnity.",
                fmt_gold(raised as i64)
            ));
        }
    }
    govern::open_payroll(game, proposal, ballots, lines);
}

/// Close the season (B5): after the council has rolled, flag the game over
/// and attach the bilan to both the game and the day report. Barreau 4: the
/// season's debt to the sea is written down once, here, before the bilan.
pub fn close_season(game: &mut Game, report: &mut crate::cycle::DayReport) {
    let bill = crate::sea::accrue(game);
    let bilan = season_bilan(game);
    game.over = true;
    game.bilan = Some(bilan.clone());
    report.season_over = true;
    report.bilan = Some(bilan);
    if bill.total > 0 {
        report.lines.push(format!(
            "The season leaves {} crates of debt to the sea ({} carried).",
            rules::format_crates(bill.total),
            rules::format_crates(bill.carried)
        ));
    }
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
    // Barreau 4: the bill, in crates, beside the net worth in gold. The
    // liability is whatever `close_season` wrote down; the season's own line
    // is read from the same journal, never re-accrued here.
    let bill = crate::sea::season_bill(game);
    Bilan {
        net_worth: worth,
        gold,
        licences,
        licence_price: price,
        boats: boats as u64,
        stocks: game.port.stocks,
        sea_debt: bill.total,
        sea_debt_total: game.sea_debt,
    }
}
