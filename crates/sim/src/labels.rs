//! Presentation primitives: slugs, colours and the gold/tenths formatting the
//! relay and the web UI read verbatim.
//!
//! Split out of [`crate::views`] so that module keeps one screen per subject
//! (and stays inside the structural line budget). Re-exported from `views`, so
//! `views::actor_id` and friends keep their historical path. Nothing here reads
//! the game state: these are pure name and number renderings.

use rules::state::{ActorId, Mesh, Zone};
use rules::survey::Trend;

/// Centigold as whole pieces with one decimal: 5040 -> 50.4.
pub fn gold_pieces(cents: i64) -> f64 {
    cents as f64 / 100.0
}

/// Weekday name for a game day (day 0 is a Monday).
pub fn weekday(day: u64) -> &'static str {
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][(day % 7) as usize]
}

/// Display tide: cosmetic chrome for the top bar, no model behind it.
pub fn tide(day: u64) -> &'static str {
    if day.is_multiple_of(2) { "High" } else { "Low" }
}

/// Zone slug for the UI and the relay flags.
pub fn zone_id(zone: Zone) -> &'static str {
    match zone {
        Zone::Shallows => "shallows",
        Zone::Greybank => "greybank",
        Zone::Deeps => "deeps",
    }
}

/// Net slug for the UI.
pub fn mesh_id(mesh: Mesh) -> &'static str {
    match mesh {
        Mesh::Large => "large",
        Mesh::Small => "small",
    }
}

/// Trend word for the UI (written out, never blinking).
pub fn trend_id(moved: Trend) -> &'static str {
    match moved {
        Trend::Rising => "rising",
        Trend::Steady => "steady",
        Trend::Falling => "falling",
    }
}

/// Actor slug for the UI and the relay flags.
pub fn actor_id(actor: ActorId) -> &'static str {
    match actor {
        ActorId::You => "you",
        ActorId::Hale => "hale",
        ActorId::Brandt => "brandt",
        ActorId::Okoro => "okoro",
        ActorId::Fishmonger => "fishmonger",
        ActorId::Cannery => "cannery",
        ActorId::Gull => "gull",
        ActorId::Bank => "bank",
        ActorId::Chandlery => "chandlery",
        ActorId::Townsfolk => "townsfolk",
    }
}

/// House colour of a captain for the sea chart (You is the buoy orange).
pub fn captain_color(captain: ActorId) -> &'static str {
    match captain {
        ActorId::You => "#e0672f",
        ActorId::Hale => "#8fc06f",
        ActorId::Brandt => "#c9b083",
        _ => "#e4ede6",
    }
}

/// Cosmetic hull names, stable per boat id (the sim tracks hulls by number).
pub fn boat_name(id: u64) -> &'static str {
    const NAMES: [&str; 12] = [
        "Skua", "Tern", "Gannet", "Fulmar", "Kittiwake", "Guillemot", "Puffin", "Petrel",
        "Shearwater", "Cormorant", "Shag", "Gull Wing",
    ];
    NAMES[(id % NAMES.len() as u64) as usize]
}
