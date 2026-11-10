//! NEP-245 core: transfers and balance views.
//!
//! Implemented: Core (transfer, batch, balances, supply) + Enumeration
//! + Metadata (game subset). Out of scope by design: Approval Management
//! and transfer_call. NPC actors (`npc:<id>`) hold balances in the same
//! ledger; [`Tidewater::get_ledger`] reads any owner string, since NPCs
//! are not NEAR accounts.

use crate::{log_event, Tidewater, TidewaterExt};
use near_sdk::json_types::U128;
use near_sdk::{env, near, require, AccountId, NearToken, Promise};

/// NEP-245 Token view (fungible items: no single owner, no approvals).
#[near(serializers = [json])]
#[derive(Clone)]
pub struct Token {
    pub token_id: String,
    pub owner_id: Option<AccountId>,
    pub metadata: Option<TokenMetadata>,
}

/// NEP-245 metadata; `base_price_milli` is our documented extra.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct TokenMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub base_price_milli: Option<u64>,
}

#[near]
impl Tidewater {
    /// Transfer `amount` of `token_id` to `receiver_id`.
    ///
    /// NEP-245 core requires one yocto attached "for security purposes". We
    /// accept one *or more* and refund the excess to the predecessor, so a
    /// wallet that rounds the deposit up never loses more than that yocto.
    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
    ) {
        Self::assert_no_approval(&approval);
        let excess = Self::assert_yocto();
        require!(self.token(&token_id).is_some(), "E_UNKNOWN_TOKEN");
        let sender = env::predecessor_account_id();
        let sender_id = sender.to_string();
        require!(sender_id != receiver_id.to_string(), "E_SELF_TRANSFER");
        let have = self.balance_of(&sender_id, &token_id);
        require!(have >= amount.0, "E_INSUFFICIENT");
        self.move_balance(&sender_id, receiver_id.as_str(), &token_id, amount.0);
        log_event(
            "nep245",
            "mt_transfer",
            &format!(
                "[{{\"old_owner_id\":\"{}\",\"new_owner_id\":\"{}\",\"token_ids\":[\"{}\"],\"amounts\":[\"{}\"],\"memo\":{}}}]",
                sender_id,
                receiver_id,
                token_id,
                amount.0,
                Self::memo_json(&memo),
            ),
        );
        Self::refund_excess(sender, excess);
    }

    /// Batch variant: all legs move or the call panics before moving any.
    #[payable]
    pub fn mt_batch_transfer(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
    ) {
        if let Some(list) = &approvals {
            require!(list.iter().all(|a| a.is_none()), "E_APPROVALS_UNSUPPORTED");
        }
        let excess = Self::assert_yocto();
        require!(token_ids.len() == amounts.len(), "E_LENGTH_MISMATCH");
        let sender = env::predecessor_account_id();
        let sender_id = sender.to_string();
        require!(sender_id != receiver_id.to_string(), "E_SELF_TRANSFER");
        for (token_id, amount) in token_ids.iter().zip(amounts.iter()) {
            require!(self.token(token_id).is_some(), "E_UNKNOWN_TOKEN");
            require!(
                self.balance_of(&sender_id, token_id) >= amount.0,
                "E_INSUFFICIENT"
            );
        }
        for (token_id, amount) in token_ids.iter().zip(amounts.iter()) {
            self.move_balance(&sender_id, receiver_id.as_str(), token_id, amount.0);
        }
        let amounts_json: Vec<String> = amounts.iter().map(|a| a.0.to_string()).collect();
        log_event(
            "nep245",
            "mt_batch_transfer",
            &format!(
                "[{{\"old_owner_id\":\"{}\",\"new_owner_id\":\"{}\",\"token_ids\":{},\"amounts\":{},\"memo\":{}}}]",
                sender_id,
                receiver_id,
                Self::json_array(&token_ids),
                Self::json_array(&amounts_json),
                Self::memo_json(&memo),
            ),
        );
        Self::refund_excess(sender, excess);
    }

    /// Tokens for the given ids, `None` when unknown.
    pub fn mt_token(&self, token_ids: Vec<String>) -> Vec<Option<Token>> {
        token_ids.iter().map(|id| self.view_token(id)).collect()
    }

    /// Enumerate tokens with pagination (Enumeration extension).
    pub fn mt_tokens(&self, skip: Option<u64>, limit: Option<u64>) -> Vec<Token> {
        let skip = skip.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;
        self.tokens
            .iter()
            .skip(skip)
            .take(limit)
            .map(|t| self.view_token(&t.token_id).expect("known token"))
            .collect()
    }

    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        U128(self.balance_of(account_id.as_str(), &token_id))
    }

    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> {
        token_ids
            .iter()
            .map(|id| U128(self.balance_of(account_id.as_str(), id)))
            .collect()
    }

    pub fn mt_supply(&self, token_id: String) -> Option<U128> {
        self.supply.get(&token_id).copied().map(U128)
    }

    pub fn mt_batch_supply(&self, token_ids: Vec<String>) -> Vec<Option<U128>> {
        token_ids.iter().map(|id| self.supply.get(id).copied().map(U128)).collect()
    }

    /// Balance of any ledger owner, NEAR account or `npc:<actor>`.
    pub fn get_ledger(&self, owner: String, token_id: String) -> U128 {
        U128(self.balance_of(&owner, &token_id))
    }
}

impl Tidewater {
    /// NEP-245 core asks for one yocto "for security purposes". Exact-one is
    /// one reading of it, "at least one" the other: we take the second and
    /// return the excess, so a transfer is never rejected for attaching more.
    /// Returns the excess to hand back; panics with `E_YOCTO_REQUIRED` at 0.
    fn assert_yocto() -> NearToken {
        let attached = env::attached_deposit();
        require!(attached >= NearToken::from_yoctonear(1), "E_YOCTO_REQUIRED");
        NearToken::from_yoctonear(attached.as_yoctonear() - 1)
    }

    /// Refund everything above the anti-abuse yocto to the predecessor.
    fn refund_excess(predecessor: AccountId, excess: NearToken) {
        if excess.as_yoctonear() > 0 {
            let _ = Promise::new(predecessor).transfer(excess);
        }
    }

    fn assert_no_approval(approval: &Option<(AccountId, u64)>) {
        require!(approval.is_none(), "E_APPROVALS_UNSUPPORTED");
    }

    fn memo_json(memo: &Option<String>) -> String {
        memo.as_ref().map(|m| format!("\"{}\"", m)).unwrap_or("null".to_string())
    }

    /// A JSON array of strings. NEP-245 indexes `token_ids` and `amounts` in
    /// parallel, so the batch event carries both arrays.
    fn json_array(items: &[String]) -> String {
        near_sdk::serde_json::to_string(items).expect("array of strings")
    }

    fn view_token(&self, token_id: &str) -> Option<Token> {
        self.token(token_id).map(|t| Token {
            token_id: t.token_id.clone(),
            owner_id: None,
            metadata: Some(TokenMetadata {
                title: Some(t.name.clone()),
                description: Some(format!("Tidewater item: {}", t.name)),
                base_price_milli: Some(t.base_price_milli),
            }),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn setup() -> (Tidewater, AccountId, AccountId) {
        let owner = accounts(0);
        let player = accounts(1);
        testing_env!(VMContextBuilder::new().predecessor_account_id(owner.clone()).build());
        (Tidewater::new(owner.clone(), player.clone()), owner, player)
    }

    fn as_caller(caller: AccountId, deposit_yocto: u128) {
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(caller)
            .attached_deposit(NearToken::from_yoctonear(deposit_yocto))
            .build());
    }

    #[test]
    fn licence_moves_between_players() {
        let (mut game, _, player) = setup();
        let buyer = accounts(2);
        as_caller(player.clone(), 1);
        game.mt_transfer(buyer.clone(), "3".to_string(), U128(2), None, None);
        assert_eq!(game.mt_balance_of(player, "3".to_string()).0, 2);
        assert_eq!(game.mt_balance_of(buyer, "3".to_string()).0, 2);
        assert_eq!(game.mt_supply("3".to_string()).unwrap().0, 20);
    }

    #[test]
    fn npc_balances_visible_in_ledger() {
        let (game, _, _) = setup();
        let bank = crate::npc_owner("bank");
        assert_eq!(game.get_ledger(bank, "0".to_string()).0, 3_000_000_000);
        let marta = crate::npc_owner("marta");
        assert_eq!(game.get_ledger(marta, "3".to_string()).0, 4);
    }

    #[test]
    #[should_panic(expected = "E_INSUFFICIENT")]
    fn transfer_refuses_uncovered() {
        let (mut game, _, player) = setup();
        as_caller(player, 1);
        game.mt_transfer(accounts(2), "2".to_string(), U128(5), None, None);
    }

    #[test]
    #[should_panic(expected = "E_YOCTO_REQUIRED")]
    fn transfer_requires_yocto() {
        let (mut game, _, player) = setup();
        as_caller(player, 0);
        game.mt_transfer(accounts(2), "3".to_string(), U128(1), None, None);
    }

    #[test]
    fn batch_checks_everything_before_moving() {
        let (mut game, _, player) = setup();
        as_caller(player.clone(), 1);
        game.mt_batch_transfer(
            accounts(2),
            vec!["3".to_string(), "10".to_string()],
            vec![U128(1), U128(1)],
            None,
            None,
        );
        assert_eq!(game.mt_balance_of(player, "3".to_string()).0, 3);
        assert_eq!(game.mt_balance_of(accounts(2), "10".to_string()).0, 1);
    }

    #[test]
    fn enumeration_and_supply_views() {
        let (game, _, _) = setup();
        assert_eq!(game.mt_tokens(None, None).len(), 15);
        assert_eq!(game.mt_tokens(Some(14), None).len(), 1);
        assert!(game.mt_supply("99".to_string()).is_none());
    }

    /// Every licence holder in the day-0 seed.
    fn licence_holders(player: &AccountId) -> Vec<String> {
        vec![
            player.to_string(),
            crate::npc_owner("marta"),
            crate::npc_owner("brandt"),
            crate::npc_owner("okoro"),
            crate::npc_owner("bank"),
        ]
    }

    fn licence_total(game: &Tidewater, holders: &[String]) -> u128 {
        holders
            .iter()
            .map(|h| game.balance_of(h, crate::LICENCE_TOKEN))
            .sum()
    }

    #[test]
    fn five_yocto_transfer_is_refunded_down_to_one() {
        let (mut game, _, player) = setup();
        let buyer = accounts(2);
        as_caller(player.clone(), 5);
        game.mt_transfer(buyer.clone(), "3".to_string(), U128(1), None, None);
        assert_eq!(game.mt_balance_of(player.clone(), "3".to_string()).0, 3);
        assert_eq!(game.mt_balance_of(buyer, "3".to_string()).0, 1);
        let receipts = near_sdk::test_utils::get_created_receipts();
        let refund = receipts
            .iter()
            .find(|r| {
                r.receiver_id == player
                    && r.actions.iter().any(|a| matches!(
                        a,
                        near_sdk::mock::MockAction::Transfer { deposit, .. }
                            if deposit.as_yoctonear() == 4
                    ))
            })
            .expect("excess yocto refunded to the predecessor");
        assert_eq!(refund.actions.len(), 1);
    }

    #[test]
    fn one_yocto_transfer_creates_the_unknown_receiver() {
        let (mut game, _, player) = setup();
        let newcomer = accounts(5);
        as_caller(player.clone(), 1);
        game.mt_transfer(newcomer.clone(), "3".to_string(), U128(1), None, None);
        assert_eq!(game.mt_balance_of(newcomer, "3".to_string()).0, 1);
        assert!(near_sdk::test_utils::get_created_receipts().is_empty());
    }

    #[test]
    #[should_panic(expected = "E_SELF_TRANSFER")]
    fn self_transfer_is_refused() {
        let (mut game, _, player) = setup();
        as_caller(player.clone(), 1);
        game.mt_transfer(player, "3".to_string(), U128(1), None, None);
    }

    #[test]
    fn transfer_logs_the_nep245_event() {
        let (mut game, _, player) = setup();
        as_caller(player, 1);
        game.mt_transfer(accounts(2), "3".to_string(), U128(1), None, Some("hi".to_string()));
        let log = near_sdk::test_utils::get_logs().join("\n");
        assert!(log.starts_with("EVENT_JSON:"));
        assert!(log.contains("\"standard\":\"nep245\""));
        assert!(log.contains("\"event\":\"mt_transfer\""));
        assert!(log.contains("\"amounts\":[\"1\"]"));
        assert!(log.contains("\"memo\":\"hi\""));
    }

    #[test]
    fn batch_transfer_takes_a_yocto_and_refunds_the_rest() {
        let (mut game, _, player) = setup();
        as_caller(player.clone(), 3);
        game.mt_batch_transfer(
            accounts(2),
            vec!["3".to_string(), "11".to_string()],
            vec![U128(1), U128(1)],
            None,
            None,
        );
        assert_eq!(game.mt_balance_of(accounts(2), "3".to_string()).0, 1);
        assert_eq!(game.mt_balance_of(accounts(2), "11".to_string()).0, 1);
        assert_eq!(game.mt_supply("3".to_string()).unwrap().0, 20);
    }

    #[test]
    fn seed_keeps_twenty_licences_and_funds_the_bank_pool() {
        let (game, _, player) = setup();
        let holders = licence_holders(&player);
        assert_eq!(
            game.mt_supply("3".to_string()).unwrap().0,
            crate::LICENCE_SUPPLY as u128
        );
        assert_eq!(licence_total(&game, &holders), crate::LICENCE_SUPPLY as u128);
        assert_eq!(
            game.get_ledger(crate::npc_owner("bank"), "3".to_string()).0,
            crate::BANK_LICENCE_POOL as u128
        );
    }

    #[test]
    fn a_transfer_conserves_the_licence_supply() {
        let (mut game, _, player) = setup();
        let holders = licence_holders(&player);
        as_caller(player, 1);
        game.mt_transfer(accounts(3), "3".to_string(), U128(2), None, None);
        let mut all = holders.clone();
        all.push(accounts(3).to_string());
        assert_eq!(licence_total(&game, &all), crate::LICENCE_SUPPLY as u128);
        assert_eq!(
            game.mt_supply("3".to_string()).unwrap().0,
            crate::LICENCE_SUPPLY as u128
        );
    }
}
