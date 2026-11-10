//! Tidewater rules: one deterministic module per game rule (brief sections 4-5).
//!
//! Shared by the offchain sim and the NEAR contract: the same inputs always
//! give the same outputs. No IO, no randomness, no floats. Gold is counted in
//! centigold (1 gold = 100 units) so prices like 3.6 land exactly; fish is
//! counted in whole crates. English code; French docs live in `docs/`.

pub mod auction;
pub mod bankruptcy;
pub mod config;
pub mod council;
pub mod debt;
pub mod goldflow;
pub mod licences;
pub mod species;
pub mod state;
pub mod stocks;
pub mod survey;
pub mod trips;

pub use config::Config;
pub use state::{ActorId, Boat, Harbour, Mesh, Species, Zone};

/// Rules schema version, bumped when a rule changes meaning.
pub const RULES_VERSION: u32 = 1;
/// Centigold per gold piece. Every gold amount in every module uses this unit.
pub const CENTS_PER_GOLD: u64 = 100;

/// Whole gold pieces converted to centigold. None on overflow.
pub fn gold_to_cents(gold: u64) -> Option<u64> {
    gold.checked_mul(CENTS_PER_GOLD)
}

/// Centigold truncated to one decimal for display: 360 -> "3.6".
pub fn format_price(cents: u64) -> String {
    format!("{}.{}", cents / 100, (cents % 100) / 10)
}

/// Exact price for sale lines: two decimals trimmed to one when exact
/// ("1.08", "3.6", "4.0"), so shown products always hold (M3).
pub fn format_exact(cents: u64) -> String {
    let text = format!("{}.{:02}", cents / 100, cents % 100);
    if text.ends_with('0') {
        text[..text.len() - 1].to_string()
    } else {
        text
    }
}

/// A bps factor shown with two decimals: 9000 -> "0.90".
pub fn format_factor_bps(factor_bps: u64) -> String {
    format!("{}.{:02}", factor_bps / 10_000, (factor_bps % 10_000) / 100)
}

/// Crate counts with a thousands separator: 3000 -> "3,000".
pub fn format_crates(crates: u64) -> String {
    let digits: Vec<char> = crates.to_string().chars().rev().collect();
    let mut out = String::new();
    for (i, ch) in digits.iter().enumerate() {
        if i > 0 && i % 3 == 0 {
            out.push(',');
        }
        out.push(*ch);
    }
    out.chars().rev().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_formats_match_the_brief_lines() {
        assert_eq!(format_price(360), "3.6");
        assert_eq!(format_price(5_040), "50.4");
        assert_eq!(format_price(400), "4.0");
        assert_eq!(format_factor_bps(9_000), "0.90");
        assert_eq!(format_crates(3_000), "3,000");
        assert_eq!(gold_to_cents(150), Some(15_000));
        assert_eq!(gold_to_cents(u64::MAX), None);
    }
}
