//! TW-C3: boat charges, bank loans, seizures, loan notes.
//!
//! Every boat costs 6 gold a day in wages, at sea or at quay (TW-C3-01). The
//! bank lends up to 300 gold per boat at 3% a week, repaid in ten weekly
//! instalments of principal tenth + 3% of outstanding; after two missed
//! instalments the boat is seized and auctioned (TW-C3-02..03). A captain who
//! cannot cover the next instalment fishes everything on small mesh
//! (TW-C3-04). Debts are transferable loan-note tokens (TW-C3-05).

use serde::{Deserialize, Serialize};

use crate::config::Config;
use crate::state::ActorId;

/// One bank loan against one boat, in centigold.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Loan {
    pub id: u64,
    pub borrower: ActorId,
    pub boat: u64,
    /// Original principal; the weekly slice is a tenth of this.
    pub principal: u64,
    pub outstanding: u64,
    pub paid_weeks: u64,
    pub missed: u64,
    /// Current holder of the loan note (bank, then whoever bought it).
    pub holder: ActorId,
}

/// Daily crew wages for a fleet of `boats` boats (TW-C3-01).
pub fn daily_charges(boats: u64, config: &Config) -> u64 {
    boats.saturating_mul(config.daily_charge)
}

/// Weekly instalment: principal tenth + 3% of outstanding (TW-C3-02).
pub fn weekly_due(loan: &Loan, config: &Config) -> u64 {
    loan.principal / config.loan_term_weeks
        + loan.outstanding.saturating_mul(config.loan_rate_weekly_bps) / 10_000
}

/// Outcome of settling one weekly instalment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Payment {
    PaidOff,
    Current,
    Missed,
    Seized,
}

/// Settle the weekly instalment: full payment advances the loan, a short
/// payment counts as missed, the second miss seizes the boat (TW-C3-03).
pub fn apply_payment(loan: &mut Loan, paid: u64, config: &Config) -> Payment {
    if paid < weekly_due(loan, config) {
        loan.missed += 1;
        return if loan.missed >= config.seizure_after_missed {
            Payment::Seized
        } else {
            Payment::Missed
        };
    }
    let slice = loan.principal / config.loan_term_weeks;
    loan.outstanding = loan.outstanding.saturating_sub(slice);
    loan.paid_weeks += 1;
    if loan.paid_weeks >= config.loan_term_weeks || loan.outstanding == 0 {
        loan.outstanding = 0;
        Payment::PaidOff
    } else {
        Payment::Current
    }
}

/// TW-C3-04 trigger: the captain cannot cover the next instalment and must
/// sail every boat on small mesh.
pub fn desperate_for_cash(gold: i64, next_due: u64) -> bool {
    i64::try_from(next_due).is_ok_and(|due| gold < due)
}

/// Buyout price of a loan note: face value of outstanding (TW-C3-05).
pub fn note_price(outstanding: u64) -> u64 {
    outstanding
}

/// Transfer a loan note to a new holder (TW-C3-05).
pub fn transfer_note(loan: &mut Loan, new_holder: ActorId) {
    loan.holder = new_holder;
}

/// Brief section 5.3 reasoning line: "Brandt sends every boat with small
/// mesh: loan payment due in 2 days, 140 short."
pub fn distress_reasoning(name: &str, days: u64, short: u64) -> String {
    let day_word = if days == 1 { "day" } else { "days" };
    format!("{name} sends every boat with small mesh: loan payment due in {days} {day_word}, {short} short.")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> Config {
        Config::default()
    }

    fn loan() -> Loan {
        Loan {
            id: 100,
            borrower: ActorId::Brandt,
            boat: 4,
            principal: 30_000,
            outstanding: 30_000,
            paid_weeks: 0,
            missed: 0,
            holder: ActorId::Bank,
        }
    }

    #[test]
    fn instalment_is_tenth_plus_3_percent() {
        let cfg = config();
        assert_eq!(daily_charges(4, &cfg), 2400);
        assert_eq!(weekly_due(&loan(), &cfg), 3900);
    }

    #[test]
    fn two_missed_payments_seize_the_boat() {
        let cfg = config();
        let mut loan = loan();
        assert_eq!(apply_payment(&mut loan, 0, &cfg), Payment::Missed);
        assert_eq!(apply_payment(&mut loan, 100, &cfg), Payment::Seized);
    }

    #[test]
    fn ten_full_payments_close_the_loan() {
        let cfg = config();
        let mut loan = loan();
        for week in 1..=10 {
            let due = weekly_due(&loan, &cfg);
            let payment = apply_payment(&mut loan, due, &cfg);
            assert_eq!(payment, if week < 10 { Payment::Current } else { Payment::PaidOff });
        }
        assert_eq!(loan.outstanding, 0);
    }

    #[test]
    fn debt_pressure_and_transfer() {
        let mut loan = loan();
        assert!(desperate_for_cash(1000, 3900));
        assert!(!desperate_for_cash(3900, 3900));
        assert_eq!(note_price(30_000), 30_000);
        transfer_note(&mut loan, ActorId::You);
        assert_eq!(loan.holder, ActorId::You);
        assert_eq!(
            distress_reasoning("Brandt", 2, 140),
            "Brandt sends every boat with small mesh: loan payment due in 2 days, 140 short."
        );
    }
}
