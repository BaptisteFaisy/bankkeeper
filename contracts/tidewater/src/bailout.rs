//! Bailouts: reopen a stopped actor for profit shares (TW-N-52).
//!
//! The investor sends gold to a closed buyer or a disarmed captain and
//! receives share tokens (200+). Every sale by that actor then pays 20 %
//! of its proceeds to the shareholders, pro rata.

use crate::{log_event, npc_owner, u64_of, Tidewater, TidewaterExt, GOLD_TOKEN, MILLIS_PER_GOLD, SHARE_CUT_BPS};
use near_sdk::json_types::U128;
use near_sdk::{env, near};

#[near]
impl Tidewater {
    /// Bail out a stopped buyer or captain, mint profit shares (TW-N-52).
    pub fn invest_in_actor(&mut self, actor_id: String, amount: U128) -> String {
        assert!(amount.0 > 0, "E_ZERO_QUANTITY");
        let caller = env::predecessor_account_id().to_string();
        assert!(self.gold_of(&caller) >= u64_of(amount.0), "E_SHORT_GOLD");
        let target = self.actor_owner(&actor_id);
        self.assert_stopped(&actor_id);
        self.move_balance(&caller, &target, GOLD_TOKEN, amount.0);
        self.reopen(&actor_id);
        let token_id = self.next_share_id.to_string();
        self.next_share_id += 1;
        self.tokens.push(crate::TokenMeta {
            token_id: token_id.clone(),
            name: format!("{} share", actor_id),
            base_price_milli: 0,
        });
        self.add_balance(&caller, &token_id, amount.0 / MILLIS_PER_GOLD as u128);
        self.shares.insert(
            token_id.clone(),
            crate::Share {
                actor: actor_id.clone(),
                actor_kind: self.actor_kind(&actor_id),
                invested_milli: u64_of(amount.0),
                repaid_milli: 0,
            },
        );
        self.push_share(&actor_id, &token_id);
        log_event(
            "tidewater",
            "invest",
            &format!("[{{\"player\":\"{}\",\"actor\":\"{}\",\"gold\":\"{}\"}}]", caller, actor_id, amount.0),
        );
        token_id
    }
}

impl Tidewater {
    pub(crate) fn pay_shareholders(&mut self, actor: &str, kind: &str, actor_owner: &str, proceeds: u64) -> u64 {
        let ids = match kind {
            "buyer" => self.buyers.get(actor).map(|b| b.share_ids.clone()).unwrap_or_default(),
            _ => self.captains.get(actor).map(|c| c.share_ids.clone()).unwrap_or_default(),
        };
        let mut paid = 0;
        for token_id in ids {
            let total = self.supply.get(&token_id).copied().unwrap_or(0);
            if total == 0 {
                continue;
            }
            let cut = proceeds * SHARE_CUT_BPS / 10_000;
            let holders: Vec<(String, u128)> = self
                .balances
                .iter()
                .filter(|((_, tid), amt)| *tid == token_id && **amt > 0)
                .map(|((o, _), amt)| (o.clone(), *amt))
                .collect();
            for (holder, amount) in holders {
                let share = cut as u128 * amount / total;
                if share > 0 {
                    self.move_balance(actor_owner, &holder, GOLD_TOKEN, share);
                    paid += u64_of(share);
                }
            }
            if let Some(share) = self.shares.get_mut(&token_id) {
                share.repaid_milli += cut;
            }
        }
        paid
    }

    fn actor_owner(&self, actor_id: &str) -> String {
        if self.buyers.contains_key(actor_id) {
            return npc_owner(actor_id);
        }
        self.captain_owner(actor_id)
    }

    fn actor_kind(&self, actor_id: &str) -> String {
        if self.buyers.contains_key(actor_id) {
            "buyer".to_string()
        } else {
            "captain".to_string()
        }
    }

    fn assert_stopped(&self, actor_id: &str) {
        if let Some(buyer) = self.buyers.get(actor_id) {
            assert!(buyer.closed, "E_ALREADY_OPEN");
        } else if let Some(captain) = self.captains.get(actor_id) {
            assert!(captain.disarmed, "E_ALREADY_OPEN");
        } else {
            panic!("E_UNKNOWN_ACTOR");
        }
    }

    fn reopen(&mut self, actor_id: &str) {
        if let Some(buyer) = self.buyers.get_mut(actor_id) {
            buyer.closed = false;
        } else if let Some(captain) = self.captains.get_mut(actor_id) {
            captain.disarmed = false;
        }
    }

    fn push_share(&mut self, actor_id: &str, token_id: &str) {
        if let Some(buyer) = self.buyers.get_mut(actor_id) {
            buyer.share_ids.push(token_id.to_string());
        } else if let Some(captain) = self.captains.get_mut(actor_id) {
            captain.share_ids.push(token_id.to_string());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::{testing_env, AccountId};

    fn setup() -> (Tidewater, AccountId, AccountId) {
        let owner = accounts(0);
        let player = accounts(1);
        testing_env!(VMContextBuilder::new().predecessor_account_id(owner.clone()).build());
        (Tidewater::new(owner.clone(), player.clone()), owner, player)
    }

    fn as_caller(caller: AccountId) {
        testing_env!(VMContextBuilder::new().predecessor_account_id(caller).build());
    }

    #[test]
    fn invest_reopens_and_mints_shares() {
        let (mut game, owner, player) = setup();
        as_caller(owner.clone());
        game.buyers.get_mut("gull").unwrap().closed = true;
        as_caller(player.clone());
        let token = game.invest_in_actor("gull".to_string(), U128(50_000));
        assert_eq!(token, crate::SHARE_FIRST.to_string());
        assert!(!game.buyers.get("gull").unwrap().closed);
        assert_eq!(game.get_ledger(player.to_string(), token).0, 50);
    }

    #[test]
    fn shareholders_take_twenty_percent_of_sales() {
        let (mut game, owner, player) = setup();
        as_caller(owner);
        game.buyers.get_mut("cannery").unwrap().closed = true;
        as_caller(player.clone());
        game.invest_in_actor("cannery".to_string(), U128(100_000));
        let before = game.get_ledger(player.to_string(), "0".to_string()).0;
        as_caller(accounts(0));
        game.run_day();
        let after = game.get_ledger(player.to_string(), "0".to_string()).0;
        // Cannery drains 22 crates at 6.0 = 132 gold, 20 % to shares,
        // minus 12 gold upkeep for the two player boats.
        assert_eq!(after - before, 14_400);
    }
}
