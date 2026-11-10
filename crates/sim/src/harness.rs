//! Balance harness: many seeds, four player policies, one numeric report.
//!
//! The harness plays whole campaigns on consecutive seeds for each policy and
//! records what a balance verdict needs: the player's final net worth and the
//! NPC captains' (does one strategy crush the others?), the real zone stocks
//! at the end and their daily troughs (does the sea hold?), the carried debt
//! to the sea and the port fund (does overfishing cost, and can it be paid
//! back?), the motions the council carried, and the lay-up history (can the
//! player lose at all?). Nothing here changes a rule — the harness drives the
//! same [`cycle::run_day`] the game plays, with a policy standing in for the
//! hands.
//!
//! Determinism is absolute: one seed and one policy replay the same campaign,
//! so the `history_hash` of a run is a fingerprint a reviewer can re-derive.

mod command;

use std::collections::BTreeMap;

use rules::config::{Config, DEMO_LEVY_PER_CRATE};
use rules::state::{ActorId, Zone};
use serde::{Deserialize, Serialize};

use crate::fastforward::{history_hash, snapshot, DayPoint};
use crate::policies::{self, Policy};
use crate::season::{open_next_season, season_bilan};
use crate::{cycle, seed_game, Game};

pub use command::cli;

/// Five-number reading of one metric over the sampled seeds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Stats {
    pub median: i64,
    pub p10: i64,
    pub p90: i64,
    pub min: i64,
    pub max: i64,
}

impl Stats {
    /// Summarise a sample; an empty sample reads as zeros.
    pub fn of(values: &[i64]) -> Self {
        let mut sorted = values.to_vec();
        sorted.sort_unstable();
        Self {
            median: percentile(&sorted, 50),
            p10: percentile(&sorted, 10),
            p90: percentile(&sorted, 90),
            min: *sorted.first().unwrap_or(&0),
            max: *sorted.last().unwrap_or(&0),
        }
    }
}

/// Linear-interpolated percentile on a sorted sample, in integer maths:
/// a sample of 1..=4 at p10 reads between the 1st and the 2nd value.
pub fn percentile(sorted: &[i64], pct: u64) -> i64 {
    if sorted.is_empty() {
        return 0;
    }
    let last = (sorted.len() - 1) as u128;
    let rank = pct.min(100) as u128 * last;
    let low = (rank / 100) as usize;
    let high = ((rank + 99) / 100).min(last) as usize;
    let step = (rank % 100) as i128;
    let a = sorted[low] as i128;
    let b = sorted[high] as i128;
    (a + (b - a) * step / 100) as i64
}

/// One (seed, policy) campaign, as the report reads it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunResult {
    pub seed: u64,
    pub policy: Policy,
    /// Final net worth in centigold: purse + licences + hulls (season bilan).
    pub net_worth: i64,
    pub gold: i64,
    pub licences: u64,
    /// Licence price at the close: what those licences are worth each.
    pub licence_price: u64,
    pub boats: u64,
    /// Real zone stocks at the end: [Shallows, Greybank, Deeps], in crates.
    pub stocks: [u64; 3],
    /// The same stocks at every season close, oldest first: does the sea go
    /// down fast, or not at all?
    pub season_stocks: Vec<[u64; 3]>,
    /// Lowest daily stock per zone over the campaign: the trough the sea
    /// actually dipped through, which the season closes can hide.
    pub min_stocks: [u64; 3],
    /// Carried debt to the sea at every season close, oldest first (crates).
    pub season_debts: Vec<u64>,
    /// Carried debt to the sea at the end of the campaign, in crates.
    pub sea_debt: u64,
    /// Port fund balance at the end of the campaign, centigold.
    pub fund_balance: i64,
    /// NPC captains' combined net worth at the end, same formula as the bilan.
    pub npc_net: i64,
    /// Council motions tabled and carried over the campaign.
    pub motions_carried: u64,
    /// Last crate price of the journal, centigold: what the market pays.
    pub crate_price: u64,
    /// Average crate price over the whole campaign, centigold: the price the
    /// market paid, flooding or scarcity included.
    pub price_avg: u64,
    /// Average crate price of every season, oldest first: the market's mood
    /// season by season — flooding first, scarcity later.
    pub season_prices: Vec<u64>,
    /// Lay-ups of the player during the campaign (a stop is final: 0 or 1).
    pub bankruptcies: u64,
    pub first_bankruptcy_day: Option<u64>,
    pub days_played: u64,
    /// Determinism fingerprint of the day series (string: u64 > 2^53).
    pub history_hash: String,
}

/// One policy's aggregate over the sampled seeds.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicySummary {
    pub runs: u64,
    pub net_worth: Stats,
    /// Final stock per zone, in crates, keyed by zone (shallows, greybank,
    /// deeps): the sea-side verdict.
    pub stocks: BTreeMap<String, Stats>,
    pub licences_median: u64,
    pub bankrupt_runs: u64,
    /// Share of runs the player ended laid up, in bps (10000 = all of them).
    pub bankrupt_share_bps: u64,
    pub median_first_bankruptcy_day: Option<u64>,
    /// Carried debt to the sea at the campaign close, in crates.
    pub sea_debt: Stats,
    /// Port fund balance at the campaign close, centigold.
    pub fund_balance: Stats,
    /// NPC captains' combined net worth at the close, centigold.
    pub npc_net: Stats,
    /// Median motions tabled and carried over a campaign.
    pub motions_median: u64,
    /// Average crate price paid over the campaign, centigold.
    pub price_avg: Stats,
    /// Runs where a zone dipped under [`COLLAPSE_BPS`] of its capacity.
    pub collapse_runs: u64,
    /// Share of collapsed runs, in bps (10000 = all of them).
    pub collapse_share_bps: u64,
}

/// A zone under this share of its capacity (bps) reads as collapsed: 10%,
/// the level under which the register shows a bank on its last crates.
pub const COLLAPSE_BPS: u64 = 1_000;

/// True when any zone dipped under [`COLLAPSE_BPS`] of capacity during the
/// campaign — the collapse rate the report reads.
pub fn collapsed(run: &RunResult, capacities: &[u64; 3]) -> bool {
    (0..3).any(|zone| run.min_stocks[zone] * 10_000 < capacities[zone] * COLLAPSE_BPS)
}

/// NPC captains' combined net worth: purse + licences at the going price +
/// hulls at the new-boat price, the bilan formula applied to the three hands.
pub fn npc_net(game: &Game) -> i64 {
    let price = game.licence_price_now() as i64;
    let hull = game.config.new_boat_cost as i64;
    [ActorId::Hale, ActorId::Brandt, ActorId::Okoro]
        .iter()
        .map(|captain| {
            game.port.gold[captain.idx()]
                + game.owned_licences(*captain) as i64 * price
                + game.boats_of(*captain).len() as i64 * hull
        })
        .sum()
}

/// Full harness output: the aggregates first, then every run, so a reader can
/// check the summary against the raw sample.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Report {
    pub seeds: u64,
    pub first_seed: u64,
    pub seasons: u64,
    pub days_per_season: u64,
    pub policies: Vec<Policy>,
    pub aggregates: BTreeMap<String, PolicySummary>,
    pub runs: Vec<RunResult>,
}

/// Tracks the player's lay-up: a stop is final, so the count is 0 or 1.
struct StopWatch {
    stopped: bool,
    count: u64,
    first: Option<u64>,
}

impl StopWatch {
    fn new(game: &Game) -> Self {
        Self {
            stopped: game.port.stopped[ActorId::You.idx()],
            count: 0,
            first: None,
        }
    }

    fn observe(&mut self, game: &Game, day: u64) {
        let now = game.port.stopped[ActorId::You.idx()];
        if now && !self.stopped {
            self.count += 1;
            self.first.get_or_insert(day);
        }
        self.stopped = now;
    }
}

/// Everything one campaign run measures, accumulated day by day.
struct Tally {
    history: Vec<DayPoint>,
    watch: StopWatch,
    season_stocks: Vec<[u64; 3]>,
    season_debts: Vec<u64>,
    season_prices: Vec<u64>,
    min_stocks: [u64; 3],
    motions: u64,
    /// Price of the crates sold since the last season close.
    price_sum: u128,
    price_crates: u128,
    /// Journal records already priced.
    history_seen: usize,
}

impl Tally {
    fn new(game: &Game) -> Self {
        Self {
            history: Vec::new(),
            watch: StopWatch::new(game),
            season_stocks: Vec::new(),
            season_debts: Vec::new(),
            season_prices: Vec::new(),
            min_stocks: game.port.stocks,
            motions: 0,
            price_sum: 0,
            price_crates: 0,
            history_seen: 0,
        }
    }

    /// One played day: fingerprint, stock troughs, lay-up watch, motions the
    /// council carried, and the season closes with their stocks and debts.
    fn observe(&mut self, game: &Game, report: &cycle::DayReport) {
        self.history.push(snapshot(game));
        self.watch.observe(game, report.day);
        for zone in 0..3 {
            self.min_stocks[zone] = self.min_stocks[zone].min(game.port.stocks[zone]);
        }
        self.price_sum += game
            .history
            .get(self.history_seen..)
            .map(|records| records.iter().map(|record| record.lot_price_sum as u128).sum::<u128>())
            .unwrap_or(0);
        self.price_crates += game
            .history
            .get(self.history_seen..)
            .map(|records| records.iter().map(|record| record.lot_crates as u128).sum::<u128>())
            .unwrap_or(0);
        self.history_seen = game.history.len();
        if let Some(council) = &report.council {
            self.motions += u64::from(council.tabled && council.tally.passed);
        }
        if report.season_over {
            self.season_stocks.push(game.port.stocks);
            self.season_debts.push(game.sea_debt);
            self.season_prices.push(season_price(self.price_sum, self.price_crates));
            self.price_sum = 0;
            self.price_crates = 0;
        }
    }
}

/// Average price of the crates sold so far, in centigold.
fn season_price(sum: u128, crates: u128) -> u64 {
    if crates == 0 {
        0
    } else {
        (sum / crates) as u64
    }
}

/// Play one campaign: `seasons` seasons on `seed`, with `policy` at the helm.
pub fn run_one(seed: u64, policy: Policy, seasons: u64) -> RunResult {
    let mut game = seed_game(seed);
    game.config.campaign_seasons = seasons.max(1);
    // The campaign opens under the same standing levy as the shipped game:
    // the browser profile and `sim init --levy 0.4` both start with the demo
    // levy on, so the port fund exists and the debt can be paid by reseed.
    game.config.levy_per_crate = DEMO_LEVY_PER_CRATE;
    policies::opening(policy, &mut game);
    let per_season = game.config.days_per_week * game.config.weeks_per_season;
    let limit = game.config.campaign_seasons * per_season + 1;
    let mut tally = Tally::new(&game);
    while (tally.history.len() as u64) < limit {
        if game.over && open_next_season(&mut game).is_err() {
            break;
        }
        policies::morning(policy, &mut game);
        let report = cycle::run_day(&mut game);
        tally.observe(&game, &report);
    }
    result(seed, policy, &game, tally)
}

/// The report of one finished campaign. The money side comes from the bilan
/// the season end uses, so the harness and the game never disagree on what a
/// purse is worth.
fn result(seed: u64, policy: Policy, game: &Game, tally: Tally) -> RunResult {
    let bilan = season_bilan(game);
    RunResult {
        seed,
        policy,
        net_worth: bilan.net_worth,
        gold: bilan.gold,
        licences: bilan.licences,
        licence_price: bilan.licence_price,
        boats: bilan.boats,
        stocks: bilan.stocks,
        season_stocks: tally.season_stocks,
        min_stocks: tally.min_stocks,
        season_debts: tally.season_debts,
        sea_debt: game.sea_debt,
        fund_balance: game.fund.balance,
        npc_net: npc_net(game),
        motions_carried: tally.motions,
        crate_price: game.last_week_crate_price().unwrap_or(game.config.base_herring),
        price_avg: average_price(game),
        season_prices: tally.season_prices,
        bankruptcies: tally.watch.count,
        first_bankruptcy_day: tally.watch.first,
        days_played: tally.history.len() as u64,
        history_hash: history_hash(&tally.history).to_string(),
    }
}

/// Average crate price the market paid over the campaign, centigold.
fn average_price(game: &Game) -> u64 {
    let (sum, crates) = game.history.iter().fold((0u128, 0u128), |(sum, crates), record| {
        (
            sum + record.lot_price_sum as u128,
            crates + record.lot_crates as u128,
        )
    });
    if crates == 0 {
        game.config.base_herring
    } else {
        (sum / crates) as u64
    }
}

/// Aggregate of one policy's batch.
pub fn summarise(runs: &[RunResult]) -> PolicySummary {
    let worth: Vec<i64> = runs.iter().map(|run| run.net_worth).collect();
    let stocks = Zone::all()
        .into_iter()
        .map(|zone| {
            let sample: Vec<i64> = runs.iter().map(|run| run.stocks[zone.idx()] as i64).collect();
            (zone_key(zone).to_string(), Stats::of(&sample))
        })
        .collect();
    let bankrupt = runs.iter().filter(|run| run.bankruptcies > 0).count() as u64;
    let mut first_days: Vec<i64> = runs.iter().filter_map(|run| run.first_bankruptcy_day).map(|day| day as i64).collect();
    first_days.sort_unstable();
    let licences: Vec<i64> = runs.iter().map(|run| run.licences as i64).collect();
    let sample = |pick: fn(&RunResult) -> i64| Stats::of(&runs.iter().map(pick).collect::<Vec<_>>());
    let capacities = Config::default().zone_capacity;
    let collapse = runs.iter().filter(|run| collapsed(run, &capacities)).count() as u64;
    PolicySummary {
        runs: runs.len() as u64,
        net_worth: Stats::of(&worth),
        stocks,
        licences_median: Stats::of(&licences).median.max(0) as u64,
        bankrupt_runs: bankrupt,
        bankrupt_share_bps: bankrupt * 10_000 / runs.len().max(1) as u64,
        median_first_bankruptcy_day: (!first_days.is_empty())
            .then(|| percentile(&first_days, 50).max(0) as u64),
        sea_debt: sample(|run| run.sea_debt as i64),
        fund_balance: sample(|run| run.fund_balance),
        npc_net: sample(|run| run.npc_net),
        motions_median: sample(|run| run.motions_carried as i64).median.max(0) as u64,
        price_avg: sample(|run| run.price_avg as i64),
        collapse_runs: collapse,
        collapse_share_bps: collapse * 10_000 / runs.len().max(1) as u64,
    }
}

/// Report key for a zone: a stable lowercase name.
fn zone_key(zone: Zone) -> &'static str {
    match zone {
        Zone::Shallows => "shallows",
        Zone::Greybank => "greybank",
        Zone::Deeps => "deeps",
    }
}

/// Play the whole grid: every seed against every policy.
pub fn run_harness(seeds: u64, first_seed: u64, seasons: u64, chosen: &[Policy]) -> Report {
    let seeds = seeds.max(1);
    let seasons = seasons.max(1);
    let mut runs = Vec::new();
    let mut aggregates = BTreeMap::new();
    for policy in chosen {
        let batch: Vec<RunResult> = (0..seeds)
            .map(|offset| run_one(first_seed + offset, *policy, seasons))
            .collect();
        aggregates.insert(policy.name().to_string(), summarise(&batch));
        runs.extend(batch);
    }
    let config = Config::default();
    Report {
        seeds,
        first_seed,
        seasons,
        days_per_season: config.days_per_week * config.weeks_per_season,
        policies: chosen.to_vec(),
        aggregates,
        runs,
    }
}

