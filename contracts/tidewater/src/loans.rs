//! Harbour loans: transferable debt notes (TW-C3-01..06).
//!
//! A loan is a token (100+). The holder is the lender: the player buys the
//! note from the bank, then grants delays or seizes the boat deed after two
//! missed weekly payments. Weekly instalments settle in `run_day`.

use crate::actions::DayOutcome;
use crate::{npc_owner, Tidewater, TidewaterExt, GOLD_TOKEN};
use near_sdk::{env, near};

#[near]
impl Tidewater {
    /// Buy a loan note: pay the lender what is owed, become lender (TW-C3-05).
    pub fn buy_loan(&mut self, token_id: String) {
        let loan = self.loans.get(&token_id).expect("E_UNKNOWN_LOAN").clone();
        let caller = env::predecessor_account_id().to_string();
        assert!(caller != loan.lender, "E_SELF_TRANSFER");
        assert!(self.gold_of(&caller) >= loan.owed_milli, "E_SHORT_GOLD");
        self.move_balance(&caller, &loan.lender, GOLD_TOKEN, loan.owed_milli as u128);
        self.move_balance(&loan.lender, &caller, &token_id, 1);
        self.loans.get_mut(&token_id).expect("loan exists").lender = caller;
    }

    /// The lender grants a delay: missed payments reset to zero (TW-C3-05).
    pub fn forbear_loan(&mut self, token_id: String) {
        let loan = self.loans.get(&token_id).expect("E_UNKNOWN_LOAN").clone();
        let caller = env::predecessor_account_id().to_string();
        let lender = self.loan_holder(&token_id).unwrap_or(loan.lender);
        assert_eq!(caller, lender, "E_NOT_LENDER");
        self.loans.get_mut(&token_id).expect("loan exists").missed = 0;
    }

    /// The lender seizes the boat deed after two missed payments (TW-C3-03).
    /// Bank-seized deeds are resold at the fixed 400 gold boat price.
    pub fn seize_boat(&mut self, token_id: String) {
        let loan = self.loans.get(&token_id).expect("E_UNKNOWN_LOAN").clone();
        let caller = env::predecessor_account_id().to_string();
        let lender = self.loan_holder(&token_id).unwrap_or(loan.lender.clone());
        assert_eq!(caller, lender, "E_NOT_LENDER");
        let borrower_owner = self
            .deed_holder(&loan.boat_deed)
            .unwrap_or_else(|| self.captain_owner(&loan.borrower));
        self.move_balance(&borrower_owner, &caller, &loan.boat_deed, 1);
        self.sub_balance(&caller, &token_id, 1);
        self.loans.remove(&token_id);
        let boat = self.boats.get_mut(&loan.boat_deed).expect("boat exists");
        boat.zone = None;
        if caller == self.player.to_string() {
            boat.captain = "player".to_string();
        }
    }

    /// Buy a bank-held boat deed for 400 gold (simplified seizure auction).
    pub fn buy_boat_from_bank(&mut self, deed: String) {
        let caller = env::predecessor_account_id().to_string();
        let bank = npc_owner("bank");
        assert!(self.balance_of(&bank, &deed) > 0, "E_BANK_HAS_NO_DEED");
        assert!(self.gold_of(&caller) >= 400_000, "E_SHORT_GOLD");
        self.move_balance(&caller, &bank, GOLD_TOKEN, 400_000);
        self.move_balance(&bank, &caller, &deed, 1);
        if caller == self.player.to_string() {
            self.boats.get_mut(&deed).expect("boat exists").captain = "player".to_string();
        }
    }
}

impl Tidewater {
    pub(crate) fn settle_loans(&mut self, outcome: &mut DayOutcome) {
        let ids: Vec<String> = self.loans.keys().cloned().collect();
        for id in ids {
            let loan = self.loans.get(&id).expect("loan exists").clone();
            let lender = self.loan_holder(&id).unwrap_or(loan.lender.clone());
            let borrower_owner = self.captain_owner(&loan.borrower);
            let interest = loan.owed_milli * 300 / 10_000;
            let due = loan.weekly_due_milli + interest;
            if self.gold_of(&borrower_owner) >= due {
                self.move_balance(&borrower_owner, &lender, GOLD_TOKEN, due as u128);
                let amortized = loan.weekly_due_milli.min(loan.owed_milli);
                let slot = self.loans.get_mut(&id).expect("loan exists");
                slot.owed_milli -= amortized;
                slot.missed = 0;
                if slot.owed_milli == 0 {
                    self.sub_balance(&lender, &id, 1);
                    self.loans.remove(&id);
                }
            } else {
                let slot = self.loans.get_mut(&id).expect("loan exists");
                slot.missed += 1;
                if slot.missed >= 2 {
                    outcome.loans_defaulted.push(id.clone());
                }
            }
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
    fn loan_buy_forbear_seize_cycle() {
        let (mut game, owner, player) = setup();
        as_caller(player.clone());
        game.buy_loan("100".to_string());
        assert_eq!(game.loans.get("100").unwrap().lender, player.to_string());
        game.loans.get_mut("100").unwrap().missed = 1;
        game.forbear_loan("100".to_string());
        assert_eq!(game.loans.get("100").unwrap().missed, 0);
        game.loans.get_mut("100").unwrap().missed = 2;
        game.seize_boat("100".to_string());
        assert_eq!(game.get_ledger(player.to_string(), "14".to_string()).0, 1);
        assert_eq!(game.boats.get("14").unwrap().captain, "player");
        as_caller(owner);
        let _ = game.run_day();
    }
}
