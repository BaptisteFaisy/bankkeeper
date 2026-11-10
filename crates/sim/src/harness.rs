//! Balance harness: many seeds, four player policies, one numeric report.
//!
//! The harness plays whole campaigns on consecutive seeds for each policy and
//! records the three things a balance verdict needs: the player's final net
//! worth (does one strategy crush the others?), the real zone stocks at the
//! end (does the sea hold?), and the lay-up history (can the player lose at
//! all?). Nothing here changes a rule — the harness drives the same
//! [`cycle::run_day`] the game plays, with a policy standing in for the hands.
//!
//! Determinism is absolute: one seed and one policy replay the same campaign,
//! so the `history_hash` of a run is a fingerprint a reviewer can re-derive.

use std::collections::BTreeMap;
use std::process::ExitCode;
use std::time::Instant;

use rules::config::Config;
use rules::state::{ActorId, Zone};
use serde::{Deserialize, Serialize};

use crate::fastforward::{history_hash, snapshot, DayPoint};
use crate::policies::{self, Policy};
use crate::season::{open_next_season, season_bilan};
use crate::{cycle, fmt_gold, seed_game, Game};

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

/// Play one campaign: `seasons` seasons on `seed`, with `policy` at the helm.
pub fn run_one(seed: u64, policy: Policy, seasons: u64) -> RunResult {
    let mut game = seed_game(seed);
    game.config.campaign_seasons = seasons.max(1);
    policies::opening(policy, &mut game);
    let per_season = game.config.days_per_week * game.config.weeks_per_season;
    let limit = game.config.campaign_seasons * per_season + 1;
    let mut history: Vec<DayPoint> = Vec::new();
    let mut watch = StopWatch::new(&game);
    let mut season_stocks: Vec<[u64; 3]> = Vec::new();
    while (history.len() as u64) < limit {
        if game.over && open_next_season(&mut game).is_err() {
            break;
        }
        policies::morning(policy, &mut game);
        let report = cycle::run_day(&mut game);
        history.push(snapshot(&game));
        watch.observe(&game, report.day);
        if report.season_over {
            season_stocks.push(game.port.stocks);
        }
    }
    // The money side comes from the bilan the season end uses, so the harness
    // and the game never disagree on what a purse is worth.
    let bilan = season_bilan(&game);
    RunResult {
        seed,
        policy,
        net_worth: bilan.net_worth,
        gold: bilan.gold,
        licences: bilan.licences,
        licence_price: bilan.licence_price,
        boats: bilan.boats,
        stocks: bilan.stocks,
        season_stocks,
        bankruptcies: watch.count,
        first_bankruptcy_day: watch.first,
        days_played: history.len() as u64,
        history_hash: history_hash(&history).to_string(),
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
    PolicySummary {
        runs: runs.len() as u64,
        net_worth: Stats::of(&worth),
        stocks,
        licences_median: Stats::of(&licences).median.max(0) as u64,
        bankrupt_runs: bankrupt,
        bankrupt_share_bps: bankrupt * 10_000 / runs.len().max(1) as u64,
        median_first_bankruptcy_day: (!first_days.is_empty())
            .then(|| percentile(&first_days, 50).max(0) as u64),
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

/// `sim harness --seeds 50 --first-seed 1 --seasons 3 --policy mixed --json out.json`
pub fn cli(args: &[String]) -> ExitCode {
    let seeds = number(args, "seeds").unwrap_or(50);
    let first_seed = number(args, "first-seed").unwrap_or(1);
    let seasons = number(args, "seasons").unwrap_or(Config::default().campaign_seasons);
    let chosen = match parse_policies(args) {
        Ok(chosen) => chosen,
        Err(bad) => {
            eprintln!("unknown policy {bad}: use passive|greedy|steward|mixed");
            return ExitCode::from(2);
        }
    };
    let started = Instant::now();
    let report = run_harness(seeds, first_seed, seasons, &chosen);
    match flag(args, "json") {
        Some(path) => {
            let text = serde_json::to_string_pretty(&report).expect("serialize");
            if let Err(error) = std::fs::write(&path, text) {
                eprintln!("cannot write {path}: {error}");
                return ExitCode::from(1);
            }
            print_table(&report, started.elapsed().as_millis());
            ExitCode::SUCCESS
        }
        None => {
            println!("{}", serde_json::to_string(&report).expect("serialize"));
            ExitCode::SUCCESS
        }
    }
}

/// `--policy` may be repeated or comma-separated; absent means every policy.
fn parse_policies(args: &[String]) -> Result<Vec<Policy>, String> {
    let mut chosen = Vec::new();
    for at in 0..args.len() {
        if args[at] != "--policy" {
            continue;
        }
        let raw = args.get(at + 1).ok_or_else(|| "".to_string())?;
        for name in raw.split(',').map(str::trim).filter(|name| !name.is_empty()) {
            let policy = Policy::parse(name).ok_or_else(|| name.to_string())?;
            if !chosen.contains(&policy) {
                chosen.push(policy);
            }
        }
    }
    Ok(if chosen.is_empty() { Policy::all().to_vec() } else { chosen })
}

/// Value of `--name`, if the flag is present.
fn flag(args: &[String], name: &str) -> Option<String> {
    args.windows(2)
        .find(|pair| pair[0] == format!("--{name}"))
        .map(|pair| pair[1].clone())
}

/// Numeric value of `--name`, if present and parsable.
fn number(args: &[String], name: &str) -> Option<u64> {
    flag(args, name).and_then(|value| value.parse().ok())
}

/// Human summary on stdout: one line per policy, gold with one decimal.
fn print_table(report: &Report, millis: u128) {
    let days = report.seasons * report.days_per_season;
    println!(
        "{} seeds x {} policies x {} days ({} ms)",
        report.seeds,
        report.policies.len(),
        days,
        millis
    );
    println!("policy      median         p10         p90  bankrupt   stock medians S/G/D");
    for (name, summary) in &report.aggregates {
        let stock = |key: &str| summary.stocks.get(key).map(|stats| stats.median).unwrap_or(0);
        println!(
            "{name:<8} {:>10} {:>11} {:>11} {:>8.0}%   {}/{}/{}",
            fmt_gold(summary.net_worth.median),
            fmt_gold(summary.net_worth.p10),
            fmt_gold(summary.net_worth.p90),
            summary.bankrupt_share_bps as f64 / 100.0,
            stock("shallows"),
            stock("greybank"),
            stock("deeps"),
        );
    }
}
