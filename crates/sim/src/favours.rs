//! Favours: the council remembers what the player did to each captain.
//!
//! Each of the three NPC captains keeps a moral book on the player: a score
//! from -5 to +5, moved only by the five events below, each with its own
//! sentence. Nothing here is hidden. The score shifts the captain's vote
//! threshold at the council (an owed captain swallows a motion that costs him
//! a little, a grudging one refuses a motion that profits him) and it shifts
//! his dawn orders (the small net out of spite, the player's ground left
//! alone), and every shift prints the clause that caused it.

use rules::config::Config;
use rules::council::Vote;
use rules::debt::{desperate_for_cash, weekly_due};
use rules::state::{ActorId, Mesh, Zone};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{fmt_tenths, Game};

/// The player puts a laid-up captain back on his feet (TW-N-52 rescue).
pub const REFLOAT: i32 = 3;
/// The player holds a captain's note and grants him a delay.
pub const DEFER: i32 = 2;
/// The player holds a captain's note and takes his hull.
pub const SEIZE: i32 = -4;
/// The player sells him a licence under the going price.
pub const CHEAP_LICENCE: i32 = 1;

/// The three captains with a book (the player keeps none).
pub const BOOKKEEPERS: [ActorId; 3] = [ActorId::Hale, ActorId::Brandt, ActorId::Okoro];

/// One captain's moral book with the player, as the player reads it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Favour {
    pub actor: ActorId,
    pub score: i32,
    /// Sentence of the last event that moved the score, in the port's voice.
    pub reason: String,
}

impl Favour {
    /// A captain with nothing on his books; a bookkeeping captain only.
    pub fn neutral(captain: ActorId) -> Self {
        Favour {
            actor: captain,
            score: 0,
            reason: "Nothing owed either way.".to_string(),
        }
    }

    /// True when the captain has enough credit to vote with the player.
    pub fn owed(&self, config: &Config) -> bool {
        self.score >= config.favour_vote_threshold
    }

    /// True when the captain holds a grudge deep enough to vote against him.
    pub fn grudging(&self, config: &Config) -> bool {
        self.score <= -config.favour_vote_threshold
    }

    /// Clause appended to the vote line when the book moved the ballot.
    /// Seizure is the only event that pays a negative score, so a grudge is
    /// read as the player having taken a hull (brief section 5.4 voice).
    pub fn clause(&self, config: &Config) -> &'static str {
        if self.owed(config) {
            " (he owes you one)"
        } else if self.grudging(config) {
            " (you seized his hull)"
        } else {
            ""
        }
    }
}

/// True when the actor is one of the three captains who keep a book.
fn keeps_a_book(actor: ActorId) -> bool {
    BOOKKEEPERS.contains(&actor)
}

impl Game {
    /// The book of one captain, materialised neutral when never touched.
    pub fn favour(&self, captain: ActorId) -> Favour {
        self.favours
            .iter()
            .find(|book| book.actor == captain)
            .cloned()
            .unwrap_or_else(|| Favour::neutral(captain))
    }

    /// One captain's score (0 when the player never moved it).
    pub fn favour_score(&self, captain: ActorId) -> i32 {
        self.favour(captain).score
    }

    /// True when the player has credit with that captain.
    pub fn owes_you_one(&self, captain: ActorId) -> bool {
        self.favour(captain).owed(&self.config)
    }

    /// True when the player carries a grudge with that captain.
    pub fn grudging(&self, captain: ActorId) -> bool {
        self.favour(captain).grudging(&self.config)
    }

    /// Every captain's book, one entry per captain, in roster order.
    pub fn favours(&self) -> Vec<Favour> {
        BOOKKEEPERS.iter().map(|captain| self.favour(*captain)).collect()
    }

    /// Move one captain's score by `delta`, clamped to the book, and record
    /// the sentence. Buyers and the player keep no book: they are ignored.
    /// Returns the journal line, or None when nothing moved.
    pub fn record_favour(&mut self, captain: ActorId, delta: i32, reason: &str) -> Option<String> {
        if !keeps_a_book(captain) || delta == 0 {
            return None;
        }
        let cap = self.config.favour_score_cap;
        let previous = self.favour_score(captain);
        let next = (previous + delta).clamp(-cap, cap);
        let entry = Favour {
            actor: captain,
            score: next,
            reason: reason.to_string(),
        };
        match self.favours.iter_mut().find(|book| book.actor == captain) {
            Some(book) => *book = entry,
            None => self.favours.push(entry),
        }
        Some(format!(
            "{} remembers: {reason} Favour {next:+} (was {previous:+}).",
            captain.name()
        ))
    }
}

/// The council behind the counting: a score shifts the economic threshold.
///
/// `pass` and `fail` are the captain's season profits under the motion and
/// under the standing rules; `offer` is the whole indemnity the player pays
/// him over the season. A neutral book returns the plain economic ballot.
pub fn court_vote(base: Vote, score: i32, config: &Config, pass: i64, fail: i64, offer: i64) -> Vote {
    let threshold = config.favour_vote_threshold;
    let aligned = pass.saturating_add(offer);
    if score >= threshold {
        return owed_vote(config, aligned, fail);
    }
    if score <= -threshold {
        return grudging_vote(config, pass, fail, offer);
    }
    base
}

/// Owed captain: with the player unless the motion costs him more than the
/// slack, measured in bps of what the standing rules would have paid him.
fn owed_vote(config: &Config, aligned: i64, fail: i64) -> Vote {
    let loss = fail.saturating_sub(aligned);
    let slack = fail.abs().saturating_mul(config.favour_owe_slack_bps as i64);
    if loss > 0 && loss.saturating_mul(10_000) > slack {
        Vote::Against
    } else {
        Vote::For
    }
}

/// Grudging captain: against the player unless the indemnity beats his cost
/// by the premium — his cost times (1 + premium), not the premium alone. A
/// captain the motion costs nothing still needs a coin on the table: the
/// clause is a grudge, not an accountant's line.
fn grudging_vote(config: &Config, pass: i64, fail: i64, offer: i64) -> Vote {
    let cost = fail.saturating_sub(pass).max(0);
    let wanted = cost.saturating_mul(10_000 + config.favour_grudge_premium_bps as i64);
    if offer.saturating_mul(10_000) > wanted {
        Vote::For
    } else {
        Vote::Against
    }
}

/// Instalments a captain owes next Monday, in centigold.
fn weekly_dues(game: &Game, captain: ActorId) -> u64 {
    game.loans
        .iter()
        .filter(|loan| loan.borrower == captain)
        .map(|loan| weekly_due(loan, &game.config))
        .sum()
}

/// A captain carrying a grudge with the player takes the small net the
/// moment he is short, out of spite — never against a council ban.
fn spite_small_mesh(game: &Game, captain: ActorId) -> bool {
    if !game.grudging(captain) || game.small_mesh_banned {
        return false;
    }
    let in_debt = game.loans.iter().any(|loan| loan.borrower == captain);
    in_debt && desperate_for_cash(game.port.gold[captain.idx()], weekly_dues(game, captain))
}

/// Catch per trip in tenths, if any trip sailed.
fn cpt_tenths(crates: u64, trips: u64) -> Option<u64> {
    crates.saturating_mul(10).checked_div(trips)
}

/// Ground the player fished last, from the journal.
fn player_zone(game: &Game) -> Option<Zone> {
    game.history
        .iter()
        .rev()
        .find_map(|record| record.fished_zone[ActorId::You.idx()])
}

/// Yesterday's catch per trip in tenths for one zone, if a trip sailed.
fn zone_cpt_tenths(game: &Game, zone: Zone) -> Option<u64> {
    let yesterday = game.history.last()?;
    cpt_tenths(yesterday.crates[zone.idx()], yesterday.trips[zone.idx()])
}

/// Best open ground other than `skip`, by yesterday's catch per trip.
fn best_zone_except(game: &Game, skip: Zone) -> Option<(Zone, u64)> {
    let mut best: Option<(Zone, u64)> = None;
    for zone in Zone::all() {
        if zone == skip || game.closed[zone.idx()] {
            continue;
        }
        let Some(cpt) = zone_cpt_tenths(game, zone) else {
            continue;
        };
        if best.map(|(_, top)| cpt > top).unwrap_or(true) {
            best = Some((zone, cpt));
        }
    }
    best
}

/// An owed captain leaves the player's ground when the next best one pays
/// within the slack of it (brief: he would rather not crowd the player).
fn spared_zone(game: &Game, captain: ActorId, zone: Option<Zone>) -> Option<(Zone, String)> {
    let zone = zone?;
    if player_zone(game) != Some(zone) {
        return None;
    }
    let (alt, alt_cpt) = best_zone_except(game, zone)?;
    let here = zone_cpt_tenths(game, zone)?;
    let floor = here.saturating_mul(10_000 - game.config.favour_zone_slack_bps);
    if alt_cpt.saturating_mul(10_000) < floor {
        return None;
    }
    let slack = game.config.favour_zone_slack_bps / 100;
    let clause = format!(
        "{} leaves {} to you: {} pays {} a trip, within {slack}% of it.",
        captain.name(),
        zone.name(),
        alt.name(),
        fmt_tenths(alt_cpt)
    );
    Some((alt, clause))
}

/// Apply the captain's moral book to his dawn plan: an owed captain spares
/// the player's ground, a grudging one takes the small net when he is short.
pub(crate) fn book_kept(game: &Game, captain: ActorId, plan: (Option<Zone>, Mesh, String)) -> (Option<Zone>, Mesh, String) {
    let (mut zone, mut mesh, mut line) = plan;
    if game.owes_you_one(captain) {
        if let Some((alt, clause)) = spared_zone(game, captain, zone) {
            zone = Some(alt);
            line.push(' ');
            line.push_str(&clause);
        }
    }
    if mesh == Mesh::Large && zone.is_some() && spite_small_mesh(game, captain) {
        mesh = Mesh::Small;
        line.push_str(" Short of the next instalment and in no mind to spare the bank: small mesh.");
    }
    (zone, mesh, line)
}

/// The player's book as the relay serves it: `[{actor, score, reason}]`.
pub fn favours_view(game: &Game) -> Vec<Value> {
    game.favours()
        .iter()
        .map(|book| {
            json!({
                "actor": crate::views::actor_id(book.actor),
                "score": book.score,
                "reason": book.reason,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::season::roll_season;
    use crate::{seed_game, views, DayRecord};
    use rules::council::Proposal;
    use rules::debt::Loan;

    /// Seven journal days of steady fishing, like a real first week.
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

    /// A council-ready harbour on a fixed seed, with one motion tabled.
    fn council_game(quota: u64) -> Game {
        let mut game = seed_game(11);
        week_old(&mut game);
        game.port.gold[ActorId::You.idx()] = 10_000_000;
        game.propose(Proposal {
            quota_per_licence: quota,
            close_zone: None,
            close_weeks: None,
            ban_small_mesh: false,
            indemnity_per_licence_week: 0,
            funding: None,
            levy_per_crate: None,
        });
        game
    }

    /// Brandt's ballot and line in a council report.
    fn brandt_ballot(game: &Game) -> (Vote, String) {
        let report = roll_season(&mut game.clone());
        let vote = report.ballots.iter().find(|(who, _, _)| *who == ActorId::Brandt).map(|(_, vote, _)| *vote);
        let line = report.lines.iter().find(|line| line.starts_with("Brandt votes")).cloned().unwrap_or_default();
        (vote.expect("Brandt sails and votes"), line)
    }

    #[test]
    fn a_rescue_puts_a_captain_in_credit_and_flips_a_borderline_motion() {
        let mut game = council_game(60);
        assert_eq!(brandt_ballot(&game).0, Vote::Against, "a neutral Brandt refuses the 60 quota");
        game.port.stopped[ActorId::Brandt.idx()] = true;
        game.refloat(ActorId::You, ActorId::Brandt, 50_000).expect("rescue");
        assert_eq!(game.favour_score(ActorId::Brandt), 3);
        assert!(game.owes_you_one(ActorId::Brandt));
        assert!(game.favour(ActorId::Brandt).reason.contains("back on its feet"));
        let (vote, line) = brandt_ballot(&game);
        assert_eq!(vote, Vote::For, "he owes you one: {line}");
        assert!(line.contains("(he owes you one)"), "{line}");
    }

    #[test]
    fn seizing_a_hull_costs_four_and_turns_the_vote() {
        let mut game = council_game(70);
        assert_eq!(brandt_ballot(&game).0, Vote::For, "a neutral Brandt backs the standing quota");
        game.buy_note(ActorId::You, crate::FIRST_LOAN_ID).expect("note bought");
        game.loans[0].missed = 1;
        game.seize_note(ActorId::You, crate::FIRST_LOAN_ID).expect("hull seized");
        assert_eq!(game.favour_score(ActorId::Brandt), -4);
        let (vote, line) = brandt_ballot(&game);
        assert_eq!(vote, Vote::Against, "no motion carries after a seizure: {line}");
        assert!(line.contains("(you seized his hull)"), "{line}");
    }

    #[test]
    fn a_neutral_book_leaves_every_ballot_untouched() {
        for quota in [70, 60, 50] {
            let plain = council_game(quota);
            let mut booked = council_game(quota);
            booked.favours.push(Favour::neutral(ActorId::Brandt));
            let (a, _) = brandt_ballot(&plain);
            let (b, line) = brandt_ballot(&booked);
            assert_eq!(a, b, "quota {quota}: a neutral book moves nothing");
            assert!(!line.contains("owes you one") && !line.contains("seized"), "{line}");
        }
    }

    #[test]
    fn the_book_stops_at_five_either_way() {
        let mut game = seed_game(11);
        for _ in 0..3 {
            game.record_favour(ActorId::Hale, REFLOAT, "You put Hale back on its feet.");
        }
        assert_eq!(game.favour_score(ActorId::Hale), 5);
        for _ in 0..3 {
            game.record_favour(ActorId::Hale, SEIZE, "You seized his hull.");
        }
        assert_eq!(game.favour_score(ActorId::Hale), -5);
        assert_eq!(game.favours().len(), 3);
    }

    #[test]
    fn a_grudging_captain_sails_small_when_short_and_never_against_a_ban() {
        let mut game = seed_game(11);
        game.loans.push(Loan {
            id: 500,
            borrower: ActorId::Hale,
            boat: 2,
            principal: 73_850,
            outstanding: 73_850,
            paid_weeks: 0,
            missed: 0,
            holder: ActorId::Bank,
        });
        game.port.gold[ActorId::Hale.idx()] = 1_000;
        crate::bots::decide_all(&mut game);
        assert!(game.boats_of(ActorId::Hale).iter().all(|hull| game.port.boats[*hull].mesh == Mesh::Large));
        game.record_favour(ActorId::Hale, -3, "You seized his hull.");
        crate::bots::decide_all(&mut game);
        assert!(game.boats_of(ActorId::Hale).iter().all(|hull| game.port.boats[*hull].mesh == Mesh::Small));
        game.small_mesh_banned = true;
        crate::bots::decide_all(&mut game);
        assert!(game.boats_of(ActorId::Hale).iter().all(|hull| game.port.boats[*hull].mesh == Mesh::Large));
    }

    #[test]
    fn an_owed_captain_leaves_the_player_ground_when_the_next_best_is_close() {
        let mut game = seed_game(11);
        let mut record = DayRecord::new(0);
        record.trips = [6, 6, 1];
        record.crates = [90, 82, 5];
        record.fished_zone[ActorId::You.idx()] = Some(Zone::Shallows);
        game.history.push(record);
        crate::bots::decide_all(&mut game);
        let zone_of = |game: &Game| game.boats_of(ActorId::Brandt).iter().map(|hull| game.port.boats[*hull].zone).collect::<Vec<_>>();
        assert_eq!(zone_of(&game), vec![Some(Zone::Shallows); 4], "a neutral Brandt crowds the Shallows");
        game.record_favour(ActorId::Brandt, 3, "You put Brandt back on its feet.");
        crate::bots::decide_all(&mut game);
        assert_eq!(zone_of(&game), vec![Some(Zone::Greybank); 4], "he leaves the player's ground");
    }

    #[test]
    fn a_deferred_note_earns_two_and_a_cheap_licence_one() {
        let mut game = seed_game(11);
        game.port.gold[ActorId::You.idx()] = 10_000_000;
        game.buy_note(ActorId::You, crate::FIRST_LOAN_ID).expect("note");
        game.loans[0].missed = 1;
        game.defer_loan(ActorId::You, crate::FIRST_LOAN_ID).expect("delay");
        assert_eq!(game.favour_score(ActorId::Brandt), 2);
        let going = game.licence_price_now();
        game.trade_licence(ActorId::Okoro, ActorId::You).expect("fair buy");
        assert_eq!(game.favour_score(ActorId::Okoro), 0, "business at the going price is no favour");
        game.trade_licence_at(ActorId::You, ActorId::Okoro, going / 2).expect("cheap sale");
        assert_eq!(game.favour_score(ActorId::Okoro), 1);
    }

    #[test]
    fn the_thresholds_are_the_ones_written_in_the_rules() {
        let config = Config::default();
        // Owed captain: a 20% slack on what the standing rules would pay him.
        assert_eq!(court_vote(Vote::Against, 3, &config, 800, 1_000, 0), Vote::For);
        assert_eq!(court_vote(Vote::Against, 3, &config, 799, 1_000, 0), Vote::Against);
        // Grudging captain: the offer must beat his cost by 30%, not by a third.
        assert_eq!(court_vote(Vote::For, -3, &config, 0, 1_000, 1_300), Vote::Against);
        assert_eq!(court_vote(Vote::For, -3, &config, 0, 1_000, 1_301), Vote::For);
        // Neutral book: the economic ballot stands, whatever the numbers.
        assert_eq!(court_vote(Vote::Against, 2, &config, 0, 1_000_000, 9_999_999), Vote::Against);
        assert_eq!(court_vote(Vote::For, -2, &config, 0, 1_000_000, 0), Vote::For);
    }

    #[test]
    fn the_state_view_shows_the_book() {
        let mut game = seed_game(11);
        game.record_favour(ActorId::Okoro, -4, "You seized his hull.");
        let state = views::view_state(&game);
        let books = state["favours"].as_array().expect("favours array");
        assert_eq!(books.len(), 3);
        assert_eq!(books[2]["actor"], "okoro");
        assert_eq!(books[2]["score"], -4);
        assert!(books[2]["reason"].as_str().unwrap().contains("seized"));
        assert_eq!(books[0]["score"], 0);
    }
}
