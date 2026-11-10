//! Round 3 B5: the season ends after 28 days with a council, then a bilan.
//!
//! Day 28 rolls the council first (tabled motion or honest no-motion),
//! flags the game over, and attaches the bilan; the day after refuses.

use rules::council::Proposal;
use rules::state::ActorId;
use sim::cycle::{run_day, try_day};
use sim::seed_game;

/// Run a full season and return the game plus its last report.
fn full_season(seed: u64) -> (sim::Game, sim::cycle::DayReport) {
    let mut game = seed_game(seed);
    let mut last = None;
    for _ in 0..28 {
        last = Some(run_day(&mut game));
    }
    (game, last.expect("28 reports"))
}

/// 28 days end the season: council rolled, over set, bilan attached.
#[test]
fn twenty_eight_days_end_the_season_with_council_then_bilan() {
    let mut game = seed_game(7);
    game.propose(Proposal {
        quota_per_licence: 60,
        close_zone: None,
        close_weeks: None,
        ban_small_mesh: false,
        indemnity_per_licence_week: 0,
        funding: None,
        levy_per_crate: None,
    });
    let mut last = None;
    for _ in 0..28 {
        last = Some(run_day(&mut game));
    }
    let report = last.expect("28 reports");
    assert_eq!(game.port.day, 28);
    assert!(game.over);
    assert!(report.season_over);
    let council = report.council.as_ref().expect("boundary council");
    assert!(council.tabled);
    let bilan = game.bilan.clone().expect("game bilan");
    let shown = report.bilan.clone().expect("report bilan");
    assert_eq!(shown.net_worth, bilan.net_worth);
    let price = game.licence_price_now();
    let licences = game.port.licences[ActorId::You.idx()];
    let boats = game.boats_of(ActorId::You).len() as i64;
    let expect =
        game.port.gold[ActorId::You.idx()] + licences as i64 * price as i64 + boats * game.config.new_boat_cost as i64;
    assert_eq!(bilan.net_worth, expect);
    assert_eq!(bilan.gold, game.port.gold[ActorId::You.idx()]);
    assert_eq!(bilan.licences, licences);
    assert_eq!(bilan.licence_price, price);
    assert_eq!(bilan.boats, boats as u64);
    assert_eq!(bilan.stocks, game.port.stocks);
}

/// The day after the season refuses through the season gate.
#[test]
fn day_after_over_errors() {
    let (mut game, _) = full_season(7);
    assert!(game.over);
    assert_eq!(try_day(&mut game).unwrap_err(), "season over".to_string());
    assert_eq!(game.port.day, 28);
}

/// A quiet season ends on an honest no-motion council (B2 at the boundary).
#[test]
fn quiet_season_ends_with_no_motion_council() {
    let (game, report) = full_season(9);
    let council = report.council.as_ref().expect("boundary council");
    assert!(!council.tabled);
    assert!(council.ballots.is_empty());
    assert_eq!(
        council.lines,
        vec!["Council of season 1: no motion tabled; the standing rules continue.".to_string()]
    );
    assert!(game.over && report.season_over);
}

/// The boundary council is stashed on the game and exposed by view_state,
/// so minutes survive a reload (B5 follow-up).
#[test]
fn last_council_survives_in_state() {
    let (game, report) = full_season(7);
    let stashed = game.last_council.as_ref().expect("stashed council");
    let council = report.council.as_ref().expect("boundary council");
    assert_eq!(stashed.lines, council.lines);
    let state = sim::views::view_state(&game);
    let shown = state.get("lastCouncil").expect("lastCouncil key");
    assert_eq!(shown.get("tabled").and_then(|v| v.as_bool()), Some(false));
    assert!(shown.get("lines").and_then(|v| v.as_array()).is_some());
}

/// `sim day` on an over game exits 1 with {"error":"season over"}.
#[test]
fn cli_day_after_over_errors() {
    let state = std::env::temp_dir().join(format!("tidewater-over-{}.json", std::process::id()));
    let (game, _) = full_season(7);
    std::fs::write(&state, serde_json::to_string(&game).unwrap()).unwrap();
    let out = std::process::Command::new(env!("CARGO_BIN_EXE_sim"))
        .args(["day", "--state"])
        .arg(&state)
        .output()
        .expect("run sim day");
    std::fs::remove_file(&state).ok();
    assert!(!out.status.success());
    let text = String::from_utf8_lossy(&out.stdout);
    assert!(text.contains("season over"), "{text}");
}
