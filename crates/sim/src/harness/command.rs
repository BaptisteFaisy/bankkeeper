//! The command line of the balance harness: flags in, one report out.

use std::process::ExitCode;
use std::time::Instant;

use rules::config::Config;

use crate::fmt_gold;
use crate::harness::{run_harness, Report};
use crate::policies::Policy;

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
    println!(
        "policy      median         p10         p90  bankrupt  collapse   sea debt     fund    npc net   stock medians S/G/D"
    );
    for (name, summary) in &report.aggregates {
        let stock = |key: &str| summary.stocks.get(key).map(|stats| stats.median).unwrap_or(0);
        println!(
            "{name:<8} {:>10} {:>11} {:>11} {:>8.0}% {:>8.0}% {:>10} {:>9} {:>10}   {}/{}/{}",
            fmt_gold(summary.net_worth.median),
            fmt_gold(summary.net_worth.p10),
            fmt_gold(summary.net_worth.p90),
            summary.bankrupt_share_bps as f64 / 100.0,
            summary.collapse_share_bps as f64 / 100.0,
            summary.sea_debt.median,
            fmt_gold(summary.fund_balance.median),
            fmt_gold(summary.npc_net.median),
            stock("shallows"),
            stock("greybank"),
            stock("deeps"),
        );
    }
}
