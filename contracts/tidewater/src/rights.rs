//! Rights resolution: deed ownership, licence cap and loan note holders.
//!
//! Rights follow token balances in the ledger (TW-C2-01, TW-C3-05, TW-C4-02).
//! A boat deed, a licence or a loan note belongs to the account that holds
//! it; internal NPC actors are piloted by the contract owner. One helper per
//! question, used by `actions`, `loans` and `nep245` — never re-implemented.

use crate::{Tidewater, LICENCE_CAP_PER_CAPTAIN};
use near_sdk::env;

impl Tidewater {
    /// Owner string holding `token_id`, or `None` when nobody does.
    /// Deeds and notes are single-quantity tokens, so this is unambiguous.
    pub(crate) fn token_holder(&self, token_id: &str) -> Option<String> {
        self.balances
            .iter()
            .find(|((_, token), amt)| token == token_id && **amt > 0)
            .map(|((owner, _), _)| owner.clone())
    }

    /// Owner string of a boat deed.
    pub(crate) fn deed_holder(&self, deed: &str) -> Option<String> {
        self.token_holder(deed)
    }

    /// Owner string of a loan note (token 100+).
    pub(crate) fn loan_holder(&self, token_id: &str) -> Option<String> {
        self.token_holder(token_id)
    }

    /// Resolves who may command a boat: the deed holder, or the contract
    /// owner when an NPC holds the deed. Returns the paying owner string.
    pub(crate) fn assert_deed_caller(&self, deed: &str) -> String {
        let caller = env::predecessor_account_id();
        let holder = self.deed_holder(deed).unwrap_or_else(|| {
            self.boats
                .get(deed)
                .map(|b| self.captain_owner(&b.captain))
                .unwrap_or_default()
        });
        if holder.starts_with("npc:") {
            assert_eq!(caller, self.owner, "owner only");
        } else {
            assert_eq!(caller.as_str(), holder.as_str(), "E_NOT_YOUR_BOAT");
        }
        holder
    }

    /// D09: nobody may hold more than `LICENCE_CAP_PER_CAPTAIN` licences.
    /// Checked on the bank sale and on every incoming transfer, so the cap
    /// cannot be walked around with `mt_transfer`.
    pub(crate) fn assert_licence_cap(&self, owner: &str, incoming: u128) {
        let held = self.licence_weight(owner) as u128;
        assert!(
            held.saturating_add(incoming) <= LICENCE_CAP_PER_CAPTAIN as u128,
            "E_LICENCE_CAP"
        );
    }

    /// D08: the loan record follows the note token, so the buyer of a note
    /// is the lender and the seller keeps nothing.
    pub(crate) fn sync_note_holder(&mut self, token_id: &str, new_owner: &str) {
        if let Some(loan) = self.loans.get_mut(token_id) {
            loan.lender = new_owner.to_string();
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::{npc_owner, Tidewater, LICENCE_CAP_PER_CAPTAIN};
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::{testing_env, AccountId};

    fn setup() -> (Tidewater, AccountId) {
        let owner = accounts(0);
        testing_env!(VMContextBuilder::new().predecessor_account_id(owner.clone()).build());
        (Tidewater::new(owner.clone(), accounts(1)), owner)
    }

    fn as_caller(caller: AccountId) {
        testing_env!(VMContextBuilder::new().predecessor_account_id(caller).build());
    }

    #[test]
    fn deed_rights_follow_the_token_not_the_captain_field() {
        let (mut game, _) = setup();
        let buyer = accounts(3);
        assert_eq!(game.deed_holder("10").unwrap(), accounts(1).to_string());
        game.move_balance(&accounts(1).to_string(), buyer.as_str(), "10", 1);
        assert_eq!(game.deed_holder("10").unwrap(), buyer.to_string());
        as_caller(buyer.clone());
        assert_eq!(game.assert_deed_caller("10"), buyer.to_string());
        as_caller(accounts(1));
        let refused = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            game.assert_deed_caller("10");
        }));
        assert!(refused.is_err(), "the seller kept the right to sail the boat");
    }

    #[test]
    fn an_npc_deed_is_piloted_by_the_owner_only() {
        let (game, owner) = setup();
        as_caller(owner);
        assert_eq!(game.assert_deed_caller("12"), npc_owner("marta"));
        as_caller(accounts(4));
        let refused = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            game.assert_deed_caller("12");
        }));
        assert!(refused.is_err(), "a stranger sailed an NPC boat");
    }

    #[test]
    fn the_licence_cap_is_enforced_on_the_incoming_side() {
        let (game, _) = setup();
        let whale = accounts(5);
        game.assert_licence_cap(whale.as_str(), LICENCE_CAP_PER_CAPTAIN as u128);
        let over = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            game.assert_licence_cap(whale.as_str(), LICENCE_CAP_PER_CAPTAIN as u128 + 1);
        }));
        assert!(over.is_err(), "a captain could hold more than the cap");
    }
}
