//! Fleet purchases: captains buy new boats from the townsfolk yard.
//!
//! The buyer pays the down payment now and signs a bank note for the rest
//! (TW-C3-02); the full price goes to the townsfolk, so gold is conserved.
//! NPCs never buy (the brief gives them no trigger).

use crate::{fmt_gold, Game};
use rules::debt::Loan;
use rules::state::{ActorId, Mesh};

impl Game {
    /// Buy a new boat: 100 gold down, 300 on a bank note at 3% a week
    /// (TW-C3-02); the full price goes to the townsfolk yard, so gold is
    /// conserved. NPCs never buy (the brief gives them no trigger).
    pub fn buy_boat(&mut self, captain: ActorId) -> Result<u64, String> {
        if !captain.is_captain() {
            return Err("only captains own boats".to_string());
        }
        if self.port.stopped[captain.idx()] {
            return Err(format!("{} is laid up", captain.name()));
        }
        let down = self.config.new_boat_cost - self.config.loan_max;
        let purse = self.port.gold[captain.idx()];
        if purse < down as i64 {
            return Err(format!(
                "needs {} down, {} holds {}",
                fmt_gold(down as i64),
                captain.name(),
                fmt_gold(purse)
            ));
        }
        if self.port.gold[ActorId::Bank.idx()] < self.config.loan_max as i64 {
            return Err("the bank is short of gold".to_string());
        }
        self.port.gold[captain.idx()] -= down as i64;
        self.port.gold[ActorId::Bank.idx()] -= self.config.loan_max as i64;
        self.port.gold[ActorId::Townsfolk.idx()] += self.config.new_boat_cost as i64;
        let boat_id = self.next_boat_id;
        self.next_boat_id += 1;
        self.port.boats.push(rules::state::Boat {
            id: boat_id,
            owner: captain,
            zone: None,
            mesh: Mesh::Large,
        });
        self.port.trips_today.push(0);
        let loan_id = self.next_loan_id;
        self.next_loan_id += 1;
        self.loans.push(Loan {
            id: loan_id,
            borrower: captain,
            boat: boat_id,
            principal: self.config.loan_max,
            outstanding: self.config.loan_max,
            paid_weeks: 0,
            missed: 0,
            holder: ActorId::Bank,
        });
        Ok(boat_id)
    }
}
