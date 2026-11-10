//! Barreau 3 — Gouverner: a motion carries its money, and every vote says
//! what the captain took.
//!
//! Barreau 2 gave the port a fund and a levy; barreau 3 turns the policy into a
//! budget. Three rules, and nothing else:
//!
//! 1. **A promise names its source.** A motion that pays an indemnity carries
//!    `Funding::Fund` (the port fund pays) or `Funding::Levies` (a further levy
//!    on next season's landings pays).
//! 2. **A promise the port cannot keep does not reach the floor.** The bill is
//!    the indemnity times the licences that would be paid times the weeks of a
//!    season; if the fund cannot cover it the motion is *irrecevable*
//!    (`tabled: false` with the reason), not voted down in silence.
//! 3. **The money moves on Mondays, week by week.** A carried motion opens a
//!    [`Payroll`] that pays one week's instalment at every Monday settlement of
//!    the season it binds. The fund never goes negative: whatever it cannot pay
//!    stays written down in `unpaid`.

use crate::{fmt_gold, Game};
use rules::council::{took_this_season, Funding, Proposal, Vote};
use rules::state::{ActorId, Zone};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// The council's standing order: who is paid, how much, for how many weeks.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Payroll {
    /// Season the instalments are paid in (the one the motion binds).
    pub season: u64,
    pub funding: Funding,
    /// Gold per licence per week, centigold.
    pub per_licence_week: u64,
    /// Mondays still to pay.
    pub weeks_left: u64,
    /// Captains who voted yes, with the licences they held at the vote.
    pub beneficiaries: Vec<(ActorId, u64)>,
    /// Indemnity the fund could not pay when its Monday came, centigold:
    /// written down, never hidden, never borrowed.
    #[serde(default)]
    pub unpaid: u64,
}

impl Payroll {
    /// One Monday's instalment for a captain holding `licences`.
    pub fn week_share(&self, licences: u64) -> u64 {
        licences.saturating_mul(self.per_licence_week)
    }

    /// One Monday's instalment for the whole payroll.
    pub fn week_total(&self) -> u64 {
        self.beneficiaries.iter().map(|(_, held)| self.week_share(*held)).sum()
    }

    /// The whole promise: one week's instalment per week still to pay.
    pub fn owed(&self) -> u64 {
        self.week_total().saturating_mul(self.weeks_left)
    }
}

/// Licences the council pays an indemnity on: every sailing captain but the
/// proposer, who does not pay itself. This is also the exposure a motion
/// carries before the vote: the worst case is every one of them saying yes.
pub fn paid_licences(game: &Game) -> u64 {
    ActorId::captains()
        .iter()
        .filter(|captain| **captain != ActorId::You && !game.port.stopped[captain.idx()])
        .map(|captain| game.port.licences[captain.idx()])
        .sum()
}

/// The bill a motion promises at most, centigold: the rate, times every
/// licence that could be paid, times the weeks of a season.
pub fn motion_bill(game: &Game, proposal: &Proposal) -> u64 {
    proposal.bill(paid_licences(game), game.config.weeks_per_season)
}

/// Barreau 3 & 5, recevabilité: a motion without its money or from a proposer
/// who has lost standing does not reach the floor. Returns the bill it promises,
/// or the reason it is irreceivable.
pub fn admission(game: &Game, proposal: &Proposal) -> Result<u64, String> {
    if game.credibility < rules::dispute::PROPOSER_CREDIBILITY_FLOOR {
        return Err(format!(
            "the proposer has lost credibility ({}), the motion is not admitted",
            game.credibility
        ));
    }
    let Some(funding) = proposal.funding() else {
        return Ok(0);
    };
    let bill = motion_bill(game, proposal);
    if funding == Funding::Levies {
        // The levy pays as the landings land; there is no purse to check
        // before the season, only a rate to set.
        return Ok(bill);
    }
    if game.fund.balance >= bill as i64 {
        return Ok(bill);
    }
    Err(format!(
        "the port fund holds {}, the motion promises {} for {} weeks",
        fmt_gold(game.fund.balance),
        fmt_gold(bill as i64),
        game.config.weeks_per_season
    ))
}

/// Extra levy a crate the levy source needs: the bill spread over the crates
/// last season landed (a crate count is the only season volume the port
/// knows before the season starts).
pub fn extra_levy_per_crate(game: &Game, bill: u64) -> u64 {
    let days = (game.config.days_per_week * game.config.weeks_per_season) as usize;
    let crates: u64 = game.recent(days).iter().map(|record| record.crates.iter().sum::<u64>()).sum();
    if crates == 0 || bill == 0 {
        return 0;
    }
    bill.saturating_add(crates - 1) / crates
}

/// Open the payroll a carried motion promises. Nothing moves yet: the first
/// instalment is paid at the next Monday of the season the motion binds.
pub(crate) fn open_payroll(
    game: &mut Game,
    proposal: &Proposal,
    ballots: &[(ActorId, Vote, u64)],
    lines: &mut Vec<String>,
) {
    let Some(funding) = proposal.funding() else {
        return;
    };
    let beneficiaries: Vec<(ActorId, u64)> = ballots
        .iter()
        .filter(|(voter, vote, held)| *voter != ActorId::You && *vote == Vote::For && *held > 0)
        .map(|(voter, _, held)| (*voter, *held))
        .collect();
    if beneficiaries.is_empty() {
        lines.push("Indemnity: no captain voted yes, so nothing is promised.".to_string());
        return;
    }
    let payroll = Payroll {
        season: game.port.season(&game.config) + 1,
        funding,
        per_licence_week: proposal.indemnity_per_licence_week,
        weeks_left: game.config.weeks_per_season,
        beneficiaries,
        unpaid: 0,
    };
    lines.push(format!(
        "Indemnity: {} from {}, {} a week on the Monday for {} weeks.",
        fmt_gold(payroll.owed() as i64),
        funding.label(),
        fmt_gold(payroll.week_total() as i64),
        payroll.weeks_left
    ));
    game.payroll = Some(payroll);
}

/// Monday: one week of indemnity leaves the fund for the captains who voted
/// yes. The fund never goes negative — what it cannot pay stays owed.
pub(crate) fn pay_week(game: &mut Game) -> Vec<String> {
    let Some(mut payroll) = game.payroll.take() else {
        return Vec::new();
    };
    let paid_weeks = game.config.weeks_per_season.saturating_sub(payroll.weeks_left);
    let week = paid_weeks + 1;
    let mut lines = Vec::new();
    let mut short = 0u64;
    for (captain, held) in payroll.beneficiaries.clone() {
        let due = payroll.week_share(held);
        if due == 0 {
            continue;
        }
        let paid = due.min(game.fund.balance.max(0) as u64);
        short += due - paid;
        if paid > 0 {
            game.fund.balance -= paid as i64;
            game.fund.paid_out += paid;
            game.port.gold[captain.idx()] += paid as i64;
            lines.push(format!(
                "Port fund pays {} to {}: week {week} indemnity.",
                fmt_gold(paid as i64),
                captain.name()
            ));
        }
    }
    if short > 0 {
        payroll.unpaid += short;
        lines.push(format!(
            "The port fund is short {} of the week {week} indemnity; it stays owed.",
            fmt_gold(short as i64)
        ));
    }
    payroll.weeks_left = payroll.weeks_left.saturating_sub(1);
    if payroll.weeks_left > 0 {
        game.payroll = Some(payroll);
    } else if payroll.unpaid > 0 {
        lines.push(format!(
            "Indemnity closed with {} still unpaid.",
            fmt_gold(payroll.unpaid as i64)
        ));
    }
    lines
}

/// Barreau 1's number, computed here from the journal rather than imported:
/// the crates a captain landed this season and the zone that gave him most.
pub(crate) fn season_take(game: &Game, captain: ActorId) -> (u64, Option<Zone>) {
    let days = (game.config.days_per_week * game.config.weeks_per_season) as usize;
    let mut per_zone = [0u64; 3];
    let mut total = 0u64;
    for record in game.recent(days) {
        let crates = record.captain_crates[captain.idx()];
        if crates == 0 {
            continue;
        }
        total += crates;
        if let Some(zone) = record.fished_zone[captain.idx()] {
            per_zone[zone.idx()] += crates;
        }
    }
    let mut top: Option<(Zone, u64)> = None;
    for zone in Zone::all() {
        let crates = per_zone[zone.idx()];
        if crates > 0 && top.map(|(_, best)| crates > best).unwrap_or(true) {
            top = Some((zone, crates));
        }
    }
    (total, top.map(|(zone, _)| zone))
}

/// A captain's ballot, plus what he took: the proof the vote rests on.
pub(crate) fn with_took(game: &Game, captain: ActorId, line: String) -> String {
    let (crates, zone) = season_take(game, captain);
    let place = zone.map(|zone| zone.name());
    format!("{line} {}", took_this_season(crates, place))
}

/// The council ledger for `GET /api/state`: the exposure a motion carries and
/// the payroll still running.
pub fn council_view(game: &Game) -> Value {
    json!({
        "indemnityLicences": paid_licences(game),
        "weeksPerSeason": game.config.weeks_per_season,
        "payroll": payroll_view(game),
    })
}

/// The standing payroll in gold pieces, or null when nothing is owed.
fn payroll_view(game: &Game) -> Value {
    let Some(payroll) = game.payroll.as_ref() else {
        return Value::Null;
    };
    let paid: Vec<Value> = payroll
        .beneficiaries
        .iter()
        .map(|(captain, held)| {
            json!({
                "captain": captain.name(),
                "licences": held,
                "week": crate::views::gold_pieces(payroll.week_share(*held) as i64),
            })
        })
        .collect();
    json!({
        "season": payroll.season,
        "funding": payroll.funding.slug(),
        "per_licence_week": crate::views::gold_pieces(payroll.per_licence_week as i64),
        "weeks_left": payroll.weeks_left,
        "week_total": crate::views::gold_pieces(payroll.week_total() as i64),
        "owed": crate::views::gold_pieces(payroll.owed() as i64),
        "unpaid": crate::views::gold_pieces(payroll.unpaid as i64),
        "beneficiaries": paid,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::season::{roll_season, roll_week};
    use crate::{seed_game, DayRecord};

    /// A season's worth of journal: Brandt took 1,820 crates from Greybank.
    fn traded() -> Game {
        let mut game = seed_game(5);
        for day in 0..7 {
            let mut record = DayRecord::new(day);
            record.trips = [3, 9, 3];
            record.crates = [30, 90, 18];
            record.captain_crates[ActorId::Hale.idx()] = 120;
            record.captain_crates[ActorId::Brandt.idx()] = 260;
            record.captain_crates[ActorId::Okoro.idx()] = 90;
            record.fished_zone[ActorId::Hale.idx()] = Some(Zone::Shallows);
            record.fished_zone[ActorId::Brandt.idx()] = Some(Zone::Greybank);
            record.fished_zone[ActorId::Okoro.idx()] = Some(Zone::Deeps);
            record.lot_price_sum = 138 * 400;
            record.lot_crates = 138;
            game.history.push(record);
        }
        game.port.day = 7;
        game
    }

    fn motion(indemnity: u64, funding: Option<Funding>) -> Proposal {
        Proposal {
            quota_per_licence: 50,
            close_zone: None,
            close_weeks: None,
            ban_small_mesh: false,
            indemnity_per_licence_week: indemnity,
            funding,
            levy_per_crate: None,
        }
    }

    #[test]
    fn the_bill_is_the_rate_times_the_licences_times_the_weeks() {
        let game = traded();
        assert_eq!(paid_licences(&game), 16, "4 + 8 + 4 licences vote");
        let paid = motion(250, Some(Funding::Fund));
        assert_eq!(motion_bill(&game, &paid), 250 * 16 * 4);
        assert_eq!(paid.bill(16, 4), 16_000, "16 gold over four weeks");
        assert_eq!(extra_levy_per_crate(&game, 966), 1, "one cent a crate");
        assert_eq!(extra_levy_per_crate(&game, 0), 0);
    }

    #[test]
    fn a_motion_the_fund_cannot_cover_is_irreceivable() {
        let mut game = traded();
        let bill = motion_bill(&game, &motion(400, Some(Funding::Fund)));
        assert_eq!(bill, 25_600);
        game.fund.balance = bill as i64 - 1;
        assert!(admission(&game, &motion(400, Some(Funding::Fund))).is_err());
        game.propose(motion(400, Some(Funding::Fund)));
        let report = roll_season(&mut game);
        assert!(!report.tabled, "{:?}", report.lines);
        let reason = report.tabled_reason.clone().expect("a reason");
        assert!(reason.contains("promises"), "{reason}");
        assert!(report.lines[0].contains("not tabled — the port fund holds"), "{:?}", report.lines);
        assert!(report.ballots.is_empty(), "nobody voted a motion that could not pay");
        assert_eq!(game.config.quota_per_licence, 70, "the standing rules continue");

        game.fund.balance = bill as i64;
        assert_eq!(admission(&game, &motion(400, Some(Funding::Fund))), Ok(25_600));
        game.propose(motion(400, Some(Funding::Fund)));
        assert!(roll_season(&mut game).tabled, "the same motion, paid for, reaches the floor");
    }

    #[test]
    fn a_carried_motion_is_paid_on_the_monday_not_in_one_lump() {
        let mut game = traded();
        game.fund.balance = 10_000_000;
        game.propose(motion(50_000, Some(Funding::Fund)));
        let report = roll_season(&mut game);
        assert!(report.tabled && report.tally.passed, "{:?}", report.lines);
        let payroll = game.payroll.clone().expect("a payroll");
        let week = payroll.week_total();
        assert!(week > 0);
        assert_eq!(game.fund.balance, 10_000_000, "nothing leaves before Monday");
        let mut closures = Vec::new();
        for _ in 0..game.config.weeks_per_season {
            let before = game.fund.balance;
            roll_week(&mut game, &mut closures);
            assert_eq!(before - game.fund.balance, week as i64, "one week's instalment");
        }
        assert!(game.payroll.is_none(), "the season's instalments are over");
        assert_eq!(game.fund.balance, 10_000_000 - payroll.owed() as i64);
        assert_eq!(game.fund.paid_out, payroll.owed());
    }

    #[test]
    fn a_beneficiary_is_credited_his_share_on_the_monday() {
        let mut game = traded();
        let mut lines = Vec::new();
        let ballots = vec![(ActorId::You, Vote::For, 4), (ActorId::Brandt, Vote::For, 8)];
        open_payroll(&mut game, &motion(400, Some(Funding::Fund)), &ballots, &mut lines);
        game.fund.balance = 1_000_000;
        let brandt = game.port.gold[ActorId::Brandt.idx()];
        pay_week(&mut game);
        assert_eq!(game.port.gold[ActorId::Brandt.idx()] - brandt, 8 * 400);
        assert_eq!(game.fund.balance, 1_000_000 - 8 * 400);
    }

    #[test]
    fn the_vote_line_says_what_the_captain_took() {
        let mut game = traded();
        game.propose(motion(0, None));
        let report = roll_season(&mut game);
        let brandt = report
            .lines
            .iter()
            .find(|line| line.starts_with("Brandt votes"))
            .expect("Brandt's line");
        assert_eq!(
            brandt,
            "Brandt votes no: a 50-crate quota costs him 640 a week, your offer pays 0. \
He took 1 820 crates from Greybank this season."
        );
    }

    #[test]
    fn a_motion_without_an_indemnity_has_no_source_and_works_as_before() {
        let mut game = traded();
        let free = motion(0, None);
        assert_eq!(free.funding(), None);
        assert_eq!(motion_bill(&game, &free), 0);
        assert_eq!(admission(&game, &free), Ok(0), "a dry fund cannot block a free motion");
        game.propose(free);
        let report = roll_season(&mut game);
        assert!(report.tabled);
        assert_eq!(report.indemnity_cost, 0);
        assert!(game.payroll.is_none());
        assert!(report.lines.iter().any(|line| line.starts_with("Tally: ")));
    }

    #[test]
    fn the_fund_never_goes_negative_even_when_the_levy_is_short() {
        let mut game = traded();
        let mut lines = Vec::new();
        let ballots = vec![(ActorId::You, Vote::For, 4), (ActorId::Brandt, Vote::For, 8)];
        open_payroll(&mut game, &motion(400, Some(Funding::Levies)), &ballots, &mut lines);
        assert!(lines[0].contains("an extra levy"), "{:?}", lines);
        let brandt = game.port.gold[ActorId::Brandt.idx()];
        game.fund.balance = 150;
        pay_week(&mut game);
        assert_eq!(game.fund.balance, 0, "the fund pays what it holds, not a cent more");
        assert_eq!(game.port.gold[ActorId::Brandt.idx()] - brandt, 150);
        assert_eq!(game.payroll.as_ref().expect("still owed").unpaid, 3_050);
        game.fund.balance = 0;
        let short = pay_week(&mut game);
        assert!(short.iter().any(|line| line.contains("stays owed")), "{short:?}");
        assert!(game.fund.balance >= 0);
        assert_eq!(game.fund.paid_out, 150);
    }
}
