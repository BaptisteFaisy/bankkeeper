//! Fast-forward graph views: the columnar series and the event markers the
//! `sim ff` CLI prints (`--series`, `--markers`).
//!
//! Split out of `views.rs` so the player-views module keeps one screen per
//! subject and stays under the structural line budget. These two functions
//! only reshape a fast-forward run; the run itself lives in `fastforward`.

use crate::fastforward::{DayPoint, FfEvent};
use serde_json::{json, Value};

/// Columnar graph series from a fast-forward run, for --series.
pub fn ff_series(history: &[DayPoint]) -> Value {
    json!({
        "days": history.iter().map(|p| p.day).collect::<Vec<_>>(),
        "stocks": history.iter().map(|p| p.stocks).collect::<Vec<_>>(),
        "herring_price": history.iter().map(|p| p.herring_price).collect::<Vec<_>>(),
        "gold_total": history.iter().map(|p| p.gold_total).collect::<Vec<_>>(),
    })
}

/// Graph markers from a fast-forward journal: closures and seizures only.
pub fn ff_markers(events: &[FfEvent]) -> Value {
    let markers: Vec<Value> = events.iter().filter(|e| e.kind == "closure" || e.kind == "seizure")
        .map(|e| json!({"day": e.day, "kind": e.kind, "detail": e.detail})).collect();
    Value::Array(markers)
}
