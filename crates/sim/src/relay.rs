//! Hand trades for the relay: licences, notes, and ballots by player order.
//!
//! The Monday settlement moves licences and notes on its own; these methods
//! are the player's hands on the same books, at the same prices. Called by
//! the `licence`, `debt`, and `council` sim commands (see server/simclient.py
//! for the argv contract). Views live in [`crate::views`].

use crate::{fmt_gold, Game};
use rules::council::Proposal;
use rules::licences::{trade_licences, LicenceError};
use rules::state::{ActorId, Zone};

/// Licence failures as the UI's friendly codes (see web FRIENDLY).
fn trade_error(error: LicenceError) -> String {
    match error {
        LicenceError::SellerShortOfLicences { .. } => "NoLicenceForSale".to_string(),
        LicenceError::BuyerShortOfGold { .. } => "NotEnoughGold".to_string(),
        other => format!("{other:?}"),
    }
}

/// Actor by relay name ("the gull" and "gull" both work).
pub fn parse_actor_name(value: &str) -> Option<ActorId> {
    match value.trim().to_lowercase().as_str() {
        "you" => Some(ActorId::You),
        "hale" => Some(ActorId::Hale),
        "brandt" => Some(ActorId::Brandt),
        "okoro" => Some(ActorId::Okoro),
        "fishmonger" => Some(ActorId::Fishmonger),
        "cannery" => Some(ActorId::Cannery),
        "gull" | "the gull" => Some(ActorId::Gull),
        "bank" | "harbour bank" => Some(ActorId::Bank),
        "chandlery" => Some(ActorId::Chandlery),
        "townsfolk" => Some(ActorId::Townsfolk),
        _ => None,
    }
}

/// Zone by relay name ("the shallows" and "shallows" both work).
pub fn parse_zone_name(value: &str) -> Option<Zone> {
    match value.trim().to_lowercase().as_str() {
        "shallows" | "the shallows" => Some(Zone::Shallows),
        "greybank" => Some(Zone::Greybank),
        "deeps" | "the deeps" => Some(Zone::Deeps),
        _ => None,
    }
}

/// One comma-separated rule token: quota<N>, close:<zone>, ban-mesh.
fn apply_rule_token(motion: &mut Proposal, token: &str) -> Result<(), String> {
    let flat: String = token.chars().filter(|ch| !ch.is_whitespace()).collect();
    if let Some(quota) = flat.strip_prefix("quota") {
        motion.quota_per_licence = quota.parse().map_err(|_| format!("bad quota in {token:?}"))?;
        return Ok(());
    }
    if let Some(zone) = flat.strip_prefix("close:").or_else(|| flat.strip_prefix("close")) {
        motion.close_zone = Some(parse_zone_name(zone).ok_or_else(|| format!("unknown zone in {token:?}"))?);
        return Ok(());
    }
    if flat == "ban-mesh" || flat == "banmesh" || flat == "bansmallmesh" {
        motion.ban_small_mesh = true;
        return Ok(());
    }
    Err(format!("unknown rule {token:?}"))
}

impl Game {
    /// Hand licence trade at the going price (TW-N-22), same economics as
    /// the Monday settlement: purse to purse, licence count conserved.
    pub fn trade_licence(&mut self, seller: ActorId, buyer: ActorId) -> Result<String, String> {
        if seller == buyer {
            return Err("cannot trade with yourself".to_string());
        }
        let price = self.licence_price_now();
        let (_, (seller_left, buyer_left, seller_gold, buyer_gold)) = trade_licences(
            self.port.licences[seller.idx()],
            self.port.licences[buyer.idx()],
            self.port.gold[seller.idx()],
            self.port.gold[buyer.idx()],
            1,
            price,
        )
        .map_err(trade_error)?;
        self.port.licences[seller.idx()] = seller_left;
        self.port.licences[buyer.idx()] = buyer_left;
        self.port.gold[seller.idx()] = seller_gold;
        self.port.gold[buyer.idx()] = buyer_gold;
        Ok(format!("{} sells a licence to {} for {}.", seller.name(), buyer.name(), fmt_gold(price as i64)))
    }

    /// Hand trade with the pooled licences (TW-N-50): buy from the pool with
    /// the bank as creditor, or sell one back to the pool against bank gold.
    pub fn pool_licence(&mut self, buyer: ActorId, buy: bool) -> Result<String, String> {
        if !buyer.is_captain() {
            return Err("only captains hold licences".to_string());
        }
        let price = self.licence_price_now() as i64;
        if buy {
            self.buy_from_pool(buyer, price)
        } else {
            self.sell_to_pool(buyer, price)
        }
    }

    /// Buy one pooled licence: purse to the bank, pool shrinks by one.
    fn buy_from_pool(&mut self, buyer: ActorId, price: i64) -> Result<String, String> {
        if self.port.licence_pool == 0 {
            return Err("no pooled licences for sale".to_string());
        }
        if self.port.gold[buyer.idx()] < price {
            return Err(format!(
                "licence costs {}, {} holds {}",
                fmt_gold(price),
                buyer.name(),
                fmt_gold(self.port.gold[buyer.idx()])
            ));
        }
        self.port.licence_pool -= 1;
        self.port.licences[buyer.idx()] += 1;
        self.port.gold[buyer.idx()] -= price;
        self.port.gold[ActorId::Bank.idx()] += price;
        Ok(format!("{} buys a pooled licence for {}.", buyer.name(), fmt_gold(price)))
    }

    /// Sell one licence back to the pool, paid out of bank gold.
    fn sell_to_pool(&mut self, buyer: ActorId, price: i64) -> Result<String, String> {
        if self.port.licences[buyer.idx()] == 0 {
            return Err(format!("{} holds no licence", buyer.name()));
        }
        if self.port.gold[ActorId::Bank.idx()] < price {
            return Err("the bank is short of gold".to_string());
        }
        self.port.licences[buyer.idx()] -= 1;
        self.port.licence_pool += 1;
        self.port.gold[buyer.idx()] += price;
        self.port.gold[ActorId::Bank.idx()] -= price;
        Ok(format!("{} sells a licence to the pool for {}.", buyer.name(), fmt_gold(price)))
    }

    /// Call a default early (TW-C3-05): the holder seizes the hull once a
    /// payment is missed, without waiting for the Monday settlement.
    pub fn seize_note(&mut self, holder: ActorId, loan_id: u64) -> Result<String, String> {
        let at = self.loans.iter().position(|loan| loan.id == loan_id).ok_or_else(|| format!("no loan {loan_id}"))?;
        let loan = &self.loans[at];
        if loan.holder != holder {
            return Err("only the note holder seizes".to_string());
        }
        if loan.missed == 0 {
            return Err(format!("loan {loan_id} is current, nothing to seize"));
        }
        let (borrower, hull) = (loan.borrower, loan.boat);
        self.loans.remove(at);
        Ok(crate::bots::seize_boat(self, borrower, holder, hull))
    }

    /// Record the player's ballot on the pending motion (None backs it).
    pub fn cast_vote(&mut self, for_motion: bool) {
        self.player_vote = Some(for_motion);
    }

    /// Player motion from a relay rule string: "quota50",
    /// "quota50,close:greybank", "quota50,ban-mesh" (TW-C4-03).
    pub fn proposed_motion(&self, rule: &str, indemnity_gold: u64) -> Result<Proposal, String> {
        let mut motion = Proposal {
            quota_per_licence: self.config.quota_per_licence,
            close_zone: None,
            ban_small_mesh: false,
            indemnity_per_licence_week: indemnity_gold.saturating_mul(100),
        };
        for token in rule.split(',').map(|part| part.trim().to_lowercase()).filter(|part| !part.is_empty()) {
            apply_rule_token(&mut motion, &token)?;
        }
        if motion.quota_per_licence == 0 {
            return Err("quota must be positive".to_string());
        }
        Ok(motion)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::seed_game;

    #[test]
    fn relay_names_round_trip() {
        assert_eq!(parse_actor_name("The Gull"), Some(ActorId::Gull));
        assert_eq!(parse_actor_name("bank"), Some(ActorId::Bank));
        assert_eq!(parse_zone_name("the deeps"), Some(Zone::Deeps));
        assert_eq!(parse_zone_name("greybank"), Some(Zone::Greybank));
        assert_eq!(parse_actor_name("santa"), None);
        assert_eq!(parse_zone_name("atlantis"), None);
    }

    #[test]
    fn rule_strings_parse_into_motions() {
        let game = seed_game(7);
        let motion = game.proposed_motion("quota50", 0).expect("quota");
        assert_eq!(motion.quota_per_licence, 50);
        assert_eq!(motion.close_zone, None);
        assert!(!motion.ban_small_mesh);
        let full = game.proposed_motion("quota50,close:greybank,ban-mesh", 10).expect("full");
        assert_eq!(full.close_zone, Some(Zone::Greybank));
        assert!(full.ban_small_mesh);
        assert_eq!(full.indemnity_per_licence_week, 1000);
        assert!(game.proposed_motion("quota0", 0).is_err());
        assert!(game.proposed_motion("close:nowhere", 0).is_err());
        assert!(game.proposed_motion("freefish", 0).is_err());
    }

    #[test]
    fn hand_licence_trades_conserve_gold_and_licences() {
        let mut game = seed_game(7);
        game.port.gold[ActorId::You.idx()] += 100_000;
        let total = game.gold_total();
        let line = game.trade_licence(ActorId::Okoro, ActorId::You).expect("trade");
        assert!(line.contains("Okoro sells a licence to You"));
        assert_eq!(game.port.licences[ActorId::You.idx()], 5);
        assert_eq!(game.port.total_licences(), 20);
        assert_eq!(game.gold_total(), total);
        assert!(game.trade_licence(ActorId::Bank, ActorId::You).is_err());
        game.pool_licence(ActorId::You, false).expect("sell to pool");
        assert_eq!(game.gold_total(), total);
        assert_eq!(game.port.total_licences(), 20);
    }

    #[test]
    fn seize_needs_a_held_note_in_default() {
        let mut game = seed_game(7);
        assert!(game.seize_note(ActorId::You, 100).is_err());
        game.loans[0].holder = ActorId::You;
        assert!(game.seize_note(ActorId::You, 100).is_err());
        game.loans[0].missed = 1;
        let line = game.seize_note(ActorId::You, 100).expect("seize");
        assert!(line.contains("seized"));
        assert!(game.loans.is_empty());
    }

    #[test]
    fn player_ballot_stands_at_the_council() {
        let mut game = seed_game(7);
        game.cast_vote(false);
        assert_eq!(game.player_vote, Some(false));
    }
}
