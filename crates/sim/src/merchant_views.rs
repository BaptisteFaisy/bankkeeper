//! Merchant panels: what each buyer would pay right now, and why.
//!
//! The arithmetic and the sentence come from [`rules::merchant`], the one file
//! that holds the pricing rules; this module only shapes them for the interface
//! (and for the tooltip the track asks for).

use serde_json::{json, Value};

use rules::state::ActorId;

use crate::Game;

/// Every price this merchant would pay right now, with its reasoning line.
/// One source of truth: `rules::merchant`, the pricing file.
pub(crate) fn buyer_limits(game: &Game, buyer: ActorId) -> Value {
    let targets = game.config.buyer_targets[buyer.idx()];
    let rows: Vec<Value> = [rules::state::Species::Herring, rules::state::Species::Cod]
        .into_iter()
        .filter(|species| targets[species.idx()] > 0)
        .map(|species| {
            let stock = game.port.stores[buyer.idx()][species.idx()];
            let target = targets[species.idx()];
            let base = game.config.base_price(species);
            json!({
                "species": species.name(),
                "limit": rules::merchant::limit(base, stock, target, game.config.stock_gain_bps) as f64 / 100.0,
                "reasoning": rules::merchant::reasoning(buyer.name(), base, stock, target, game.config.stock_gain_bps),
            })
        })
        .collect();
    Value::Array(rows)
}
