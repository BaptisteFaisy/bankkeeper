//! Barreau 2 — the landing levy and the port fund.
//!
//! What I land today costs someone else and costs tomorrow. The levy puts a
//! price on that: every sale on the Dutch clock pays
//! `config.levy_per_crate x crates` out of the seller's proceeds into the port
//! fund, and the fund is what pays for the repair (net mending, closed-zone
//! restocking, a laid-up captain's refit). Nothing leaves the port: the gold
//! moves from a purse to the fund, so `Game::gold_total` — the TW-N-42 input —
//! counts both and the books still close.
//!
//! The `Fund` type and the `Game::fund` field live in [`crate`] with the rest
//! of the game state; the bookkeeping lives here so `lib.rs` stays inside the
//! 500-line structural cap.

use crate::{fmt_gold, Game};
use rules::council::{vote_reasoning, vote_reasoning_levy, Proposal, Vote};
use rules::state::ActorId;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// The port fund: the landing levy goes in, the repairs come out.
///
/// Barreau 2 of the column: the externality has a price and the price pays for
/// the repair. `balance` is gold the port holds in common; `paid_in` and
/// `paid_out` are cumulative counters, never reset. Amounts in centigold.
/// The fund is gold in the port, not outside it: `Game::gold_total` counts it,
/// so TW-N-42 (nothing appears, nothing vanishes) still holds.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Fund {
    pub balance: i64,
    pub paid_in: u64,
    pub paid_out: u64,
}

/// Gold with a decimal ("0.8") to centigold, capped at ten a crate.
pub fn levy_cents(raw: &str) -> u64 {
    let gold = raw.trim().parse::<f64>().unwrap_or(0.0).clamp(0.0, 10.0);
    (gold * 100.0).round() as u64
}

/// Parse a `levy:0.8` relay token into centigold per crate.
pub fn parse_levy_token(levy: &str, token: &str) -> Result<u64, String> {
    let gold: f64 = levy
        .trim_start_matches(':')
        .parse()
        .map_err(|_| format!("bad levy in {token:?}"))?;
    if !(0.0..=10.0).contains(&gold) {
        return Err(format!("levy must be 0 to 10 gold a crate, got {token:?}"));
    }
    Ok((gold * 100.0).round() as u64)
}

/// Format a captain's council reasoning line, choosing levy vs quota wording.
pub(crate) fn vote_line(
    captain: ActorId,
    vote: Vote,
    proposal: &Proposal,
    weekly_cost: u64,
    offer: u64,
) -> String {
    match proposal.levy_per_crate {
        Some(levy) => vote_reasoning_levy(captain.name(), vote, levy, weekly_cost, offer),
        None => vote_reasoning(captain.name(), vote, proposal.quota_per_licence, weekly_cost, offer),
    }
}

impl Game {
    /// Levy a sale would pay: `levy_per_crate x crates`, never more than the
    /// sale itself. Pure, so the views and the tests can ask without moving
    /// a cent.
    pub fn levy_due(&self, crates: u64, total: i64) -> i64 {
        let rate = self.config.levy_per_crate;
        if rate == 0 || crates == 0 || total <= 0 {
            return 0;
        }
        rate.saturating_mul(crates).min(total as u64) as i64
    }

    /// Take the landing levy on one sale: the seller pays, the fund receives,
    /// the returned amount is what was withheld. The sale itself is already
    /// on the seller's purse, so this is a transfer, not a second price.
    pub fn levy_on_sale(&mut self, seller: ActorId, crates: u64, total: i64) -> i64 {
        let due = self.levy_due(crates, total);
        if due == 0 {
            return 0;
        }
        self.port.gold[seller.idx()] -= due;
        self.fund.balance += due;
        self.fund.paid_in += due as u64;
        due
    }

    /// Pay a repair out of the fund. Refuses a dry fund: the levy is not a
    /// loan, and a promise the port cannot keep is worse than no promise.
    pub fn pay_from_fund(&mut self, to: ActorId, amount: i64, reason: &str) -> Result<(), String> {
        if amount <= 0 {
            return Err("the fund only pays positive amounts".to_string());
        }
        if self.fund.balance < amount {
            return Err(format!(
                "the port fund holds {}, cannot pay {}",
                fmt_gold(self.fund.balance),
                fmt_gold(amount)
            ));
        }
        self.fund.balance -= amount;
        self.fund.paid_out += amount as u64;
        self.port.gold[to.idx()] += amount;
        journal(
            self,
            format!(
                "Port fund pays {} to {}: {reason}.",
                fmt_gold(amount),
                to.name()
            ),
        );
        Ok(())
    }

    /// Carry a passed levy motion. Same rule as the quota (TW-C4-01): the
    /// council votes next season's rate and the new rate starts with the
    /// season, never in the middle of one.
    pub fn apply_levy(&mut self, levy: u64, lines: &mut Vec<String>) {
        if self.config.levy_per_crate == levy {
            return;
        }
        self.config.levy_per_crate = levy;
        lines.push(format!(
            "Levy set at {} a crate from next season.",
            fmt_gold(levy as i64)
        ));
    }
}

/// Append a line to the day being played, or to the last closed day, so the
/// ledger the player reads carries the fund's movements.
pub(crate) fn journal(game: &mut Game, line: String) {
    if let Some(pending) = game.pending.as_mut() {
        pending.report.lines.push(line);
    } else if let Some(report) = game.last_report.as_mut() {
        report.lines.push(line);
    }
}

/// The fund as the views show it: balance, in, out, in gold pieces.
pub fn fund_view(game: &Game) -> Value {
    json!({
        "balance": crate::views::gold_pieces(game.fund.balance),
        "paid_in": crate::views::gold_pieces(game.fund.paid_in as i64),
        "paid_out": crate::views::gold_pieces(game.fund.paid_out as i64),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cycle::run_day;
    use crate::views::{view_judges, view_state};
    use crate::{seed_game, season};
    use rules::council::Proposal;

    /// A game with the demo levy on (0.4 gold a crate).
    fn levied() -> Game {
        let mut game = seed_game(7);
        game.config.levy_per_crate = rules::config::DEMO_LEVY_PER_CRATE;
        game
    }

    fn motion(levy: Option<u64>) -> Proposal {
        Proposal {
            quota_per_licence: 70,
            close_zone: None,
            close_weeks: None,
            ban_small_mesh: false,
            indemnity_per_licence_week: 0,
            funding: None,
            levy_per_crate: levy,
        }
    }

    #[test]
    fn a_levy_of_point_four_takes_four_gold_from_a_hundred_gold_lot() {
        let mut game = levied();
        let before = game.port.gold[ActorId::Hale.idx()];
        game.port.gold[ActorId::Hale.idx()] += 10_000; // the sale lands first
        let levy = game.levy_on_sale(ActorId::Hale, 10, 10_000);
        assert_eq!(levy, 400, "0.4 a crate on ten crates is 4.00 gold");
        assert_eq!(game.fund.balance, 400);
        assert_eq!(game.fund.paid_in, 400);
        assert_eq!(game.port.gold[ActorId::Hale.idx()] - before, 9_600);
        assert_eq!(
            game.port.gold[ActorId::Hale.idx()] - before,
            10_000 * 96 / 100,
            "the seller keeps 96%"
        );
    }

    #[test]
    fn a_zero_levy_moves_nothing() {
        let mut game = seed_game(7); // default rate is 0
        let before = game.port.gold[ActorId::Hale.idx()];
        assert_eq!(game.levy_on_sale(ActorId::Hale, 10, 10_000), 0);
        assert_eq!(game.port.gold[ActorId::Hale.idx()], before);
        assert_eq!(game.fund.balance, 0);
        assert_eq!(game.fund.paid_in, 0);
    }

    #[test]
    fn the_levy_never_eats_more_than_the_sale() {
        let mut game = levied();
        let before = game.port.gold[ActorId::Brandt.idx()];
        // Ten crates at 0.4 would be 4.00 gold; the whole lot fetched 2.50.
        game.port.gold[ActorId::Brandt.idx()] += 250;
        assert_eq!(game.levy_on_sale(ActorId::Brandt, 10, 250), 250);
        assert_eq!(game.fund.balance, 250);
        assert_eq!(game.port.gold[ActorId::Brandt.idx()], before);
        assert_eq!(game.levy_on_sale(ActorId::Brandt, 10, 0), 0, "a lost lot pays nothing");
    }

    #[test]
    fn the_fund_keeps_the_gold_in_the_port() {
        let mut game = levied();
        let before = game.gold_total();
        game.port.gold[ActorId::Hale.idx()] += 10_000; // the sale is credited first
        game.levy_on_sale(ActorId::Hale, 10, 10_000);
        assert_eq!(game.gold_total(), before + 10_000, "purse to fund is a transfer");
        game.port.gold[ActorId::Hale.idx()] += 5_000; // a second sale
        game.levy_on_sale(ActorId::Hale, 5, 5_000);
        assert_eq!(game.fund.balance, 600);
        assert_eq!(game.fund.paid_in, 600);
        assert_eq!(game.gold_total(), before + 15_000);
        game.pay_from_fund(ActorId::Townsfolk, 200, "net mending").unwrap();
        assert_eq!(game.fund.balance, 400);
        assert_eq!(game.fund.paid_out, 200);
        assert_eq!(game.gold_total(), before + 15_000, "a payout stays in the port");
    }

    #[test]
    fn pay_from_fund_refuses_a_dry_fund() {
        let mut game = seed_game(7);
        let error = game.pay_from_fund(ActorId::Townsfolk, 100, "net mending").unwrap_err();
        assert!(error.contains("holds"), "got {error}");
        assert_eq!(game.fund.balance, 0);
        assert_eq!(game.fund.paid_out, 0);
        game.fund.balance = 1_000;
        assert!(game.pay_from_fund(ActorId::Townsfolk, 0, "nothing").is_err());
        assert!(game.pay_from_fund(ActorId::Townsfolk, 1_001, "too much").is_err());
        assert_eq!(game.fund.balance, 1_000);
    }

    #[test]
    fn a_day_of_sales_pays_the_levy_into_the_fund() {
        let mut game = levied();
        let before = game.gold_total();
        let report = run_day(&mut game);
        assert!(game.fund.balance > 0, "a day of lots fills the fund");
        assert_eq!(game.fund.paid_in as i64, game.fund.balance);
        let levy_lines = report.lines.iter().filter(|line| line.starts_with("Levy: ")).count();
        assert!(levy_lines > 0, "one Levy line per sold lot");
        assert!(report.lines.iter().any(|line| line.ends_with("crates to the port fund.")));
        // Conservation holds with the fund inside the gold total (TW-N-42).
        assert!(report.invariant_ok, "{:?}", report.lines);
        assert_ne!(game.gold_total(), before, "sanity: the day traded at all");
    }

    #[test]
    fn a_levy_motion_binds_next_season_not_this_one() {
        let mut game = levied();
        game.config.levy_per_crate = 80; // this season's rate: 0.8 a crate
        assert_eq!(game.levy_on_sale(ActorId::Hale, 10, 4_000), 800);
        game.propose(motion(Some(0))); // next season: no levy at all
        let report = season::roll_season(&mut game);
        assert!(report.tally.passed, "{:?}", report.lines);
        assert_eq!(game.config.levy_per_crate, 0);
        assert!(report.lines.iter().any(|line| line.contains("from next season")));
        assert_eq!(game.levy_due(10, 4_000), 0, "the new rate is live");
    }

    #[test]
    fn the_fund_shows_in_the_views() {
        let mut game = levied();
        game.levy_on_sale(ActorId::Hale, 10, 10_000);
        let state = view_state(&game);
        assert_eq!(state["fund"]["balance"], 4.0);
        assert_eq!(state["fund"]["paid_in"], 4.0);
        assert_eq!(state["fund"]["paid_out"], 0.0);
        assert_eq!(state["levyPerCrate"], 0.4);
        let judges = view_judges(&game);
        assert_eq!(judges["fund"]["balance"], 4.0);
        assert_eq!(judges["fund"]["paid_out"], 0.0);
    }
}
