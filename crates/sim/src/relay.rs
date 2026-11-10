//! Hand trades for the relay: licences, notes, ballots and the lease desk.
//!
//! The Monday settlement moves licences and notes on its own; these methods
//! are the player's hands on the same books, at the same prices, and
//! [`Game::settle_leases`] is the rent round the season runs before them.
//! Called by the `licence`, `debt`, `council` and `lease` sim commands (see
//! server/simclient.py for the argv contract). Views live in [`crate::views`].

use crate::{fmt_gold, Game};
use rules::council::{Funding, Proposal};
use rules::licences::{
    cap_reached, default_weekly_rent, leased_out, rent_covered, sellable_licences, trade_licences,
    Lease, LicenceError, MAX_LEASE_WEEKS,
};
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
    if let Some(levy) = flat.strip_prefix("levy") {
        motion.levy_per_crate = Some(crate::fund::parse_levy_token(levy, token)?);
        return Ok(());
    }
    if let Some(spec) = flat.strip_prefix("close:").or_else(|| flat.strip_prefix("close")) {
        // Barreau 5: `close:greybank:2` closes Greybank for two weeks;
        // `close:greybank` runs the whole season.
        let mut parts = spec.split(':');
        let zone = parts.next().unwrap_or_default();
        motion.close_zone = Some(parse_zone_name(zone).ok_or_else(|| format!("unknown zone in {token:?}"))?);
        if let Some(weeks) = parts.next() {
            motion.close_weeks = Some(weeks.parse().map_err(|_| format!("bad weeks in {token:?}"))?);
        }
        return Ok(());
    }
    if flat == "ban-mesh" || flat == "banmesh" || flat == "bansmallmesh" {
        motion.ban_small_mesh = true;
        return Ok(());
    }
    // Barreau 3: the source that pays the indemnity, "pay:fund" or
    // "pay:levies". The motion is voted with its money or not at all.
    if let Some(source) = flat.strip_prefix("pay:").or_else(|| flat.strip_prefix("fund:")) {
        motion.funding = Some(
            Funding::from_slug(source).ok_or_else(|| format!("unknown funding {token:?}"))?,
        );
        return Ok(());
    }
    Err(format!("unknown rule {token:?}"))
}

impl Game {
    /// Hand licence trade at the going price (TW-N-22), same economics as
    /// the Monday settlement: purse to purse, licence count conserved.
    pub fn trade_licence(&mut self, seller: ActorId, buyer: ActorId) -> Result<String, String> {
        let price = self.licence_price_now();
        self.trade_licence_at(seller, buyer, price)
    }

    /// Hand trade at a named price in centigold. Below the going price the
    /// buyer's book opens by one; at the going price it is plain business and
    /// moves nothing (no commercial grudge either way).
    pub fn trade_licence_at(&mut self, seller: ActorId, buyer: ActorId, price: u64) -> Result<String, String> {
        if seller == buyer {
            return Err("cannot trade with yourself".to_string());
        }
        let cap = self.config.licence_cap_per_captain;
        if cap_reached(self.owned_licences(buyer), cap, 1) {
            return Err(format!("{} already holds {cap} licences, the ceiling for one captain", buyer.name()));
        }
        if sellable_licences(self.owned_licences(seller), leased_out(&self.leases, seller)) == 0 {
            return Err(format!("{} has a lease running on that licence: take it back first", seller.name()));
        }
        let going = self.licence_price_now();
        let (_, (seller_left, buyer_left, seller_gold, buyer_gold)) = trade_licences(
            self.port.licences[seller.idx()], self.port.licences[buyer.idx()],
            self.port.gold[seller.idx()], self.port.gold[buyer.idx()], 1, price,
        ).map_err(trade_error)?;
        self.port.licences[seller.idx()] = seller_left;
        self.port.licences[buyer.idx()] = buyer_left;
        self.port.gold[seller.idx()] = seller_gold;
        self.port.gold[buyer.idx()] = buyer_gold;
        if seller == ActorId::You && price < going {
            let reason = format!("You sold {} a licence under the going price ({} against {}).", buyer.name(), fmt_gold(price as i64), fmt_gold(going as i64));
            self.record_favour(buyer, crate::favours::CHEAP_LICENCE, &reason);
        }
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
        let cap = self.config.licence_cap_per_captain;
        if cap_reached(self.owned_licences(buyer), cap, 1) {
            return Err(format!(
                "{} already holds {cap} licences, the ceiling for one captain",
                buyer.name()
            ));
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
        let free = sellable_licences(self.owned_licences(buyer), leased_out(&self.leases, buyer));
        if free == 0 {
            return Err(format!(
                "{} has no free licence: a lease is running on it",
                buyer.name()
            ));
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

    /// Rent one licence out for `weeks` weeks at the default weekly rent
    /// (TW-N-24): 5% of the going licence price, one gold piece at least.
    /// The quota follows the lessee for the whole term while the licence
    /// stays the lessor's property; the 8-licence ceiling never applies to a
    /// licence rented in, only to the ones a captain owns.
    pub fn lease(&mut self, lessor: ActorId, lessee: ActorId, weeks: u64) -> Result<String, String> {
        if !lessor.is_captain() || !lessee.is_captain() {
            return Err("only captains hold licences".to_string());
        }
        if lessor == lessee {
            return Err("cannot lease a licence to yourself".to_string());
        }
        if weeks == 0 || weeks > MAX_LEASE_WEEKS {
            return Err(format!("a lease runs 1 to {MAX_LEASE_WEEKS} weeks: {weeks} asked"));
        }
        let owned = self.owned_licences(lessor);
        if sellable_licences(owned, leased_out(&self.leases, lessor)) == 0 {
            return Err(format!("{} has no free licence to lease", lessor.name()));
        }
        let rent = default_weekly_rent(self.licence_price_now());
        self.port.licences[lessor.idx()] -= 1;
        self.port.licences[lessee.idx()] += 1;
        self.leases.push(Lease {
            lessor,
            lessee,
            weekly_rent: rent,
            starts_week: self.port.week(&self.config),
            weeks_left: weeks,
        });
        Ok(format!(
            "{} leases a licence to {} for {weeks} weeks at {} a week.",
            lessor.name(),
            lessee.name(),
            fmt_gold(rent as i64)
        ))
    }

    /// End a lease early, free of charge and without penalty: the licence
    /// goes back to the lessor and the quota with it. Either party may end
    /// it — the lessor to sell its licence, the lessee to stop paying.
    pub fn unlease(&mut self, actor: ActorId, other: ActorId) -> Result<String, String> {
        let at = self.leases.iter().position(|lease| {
            (lease.lessor == actor && lease.lessee == other)
                || (lease.lessor == other && lease.lessee == actor)
        });
        let lease = match at {
            Some(at) => self.leases.remove(at),
            None => {
                return Err(format!(
                    "no lease between {} and {}",
                    actor.name(),
                    other.name()
                ))
            }
        };
        self.release_licence(&lease);
        Ok(format!(
            "Lease ended early: {} takes the licence back from {}.",
            lease.lessor.name(),
            lease.lessee.name()
        ))
    }

    /// Hand a leased licence back to its owner: the lessee stops fishing it.
    fn release_licence(&mut self, lease: &Lease) {
        let (lessor, lessee) = (lease.lessor.idx(), lease.lessee.idx());
        self.port.licences[lessee] = self.port.licences[lessee].saturating_sub(1);
        self.port.licences[lessor] = self.port.licences[lessor].saturating_add(1);
    }

    /// Monday rent round (TW-N-24), run before the licence market opens. Every
    /// lease pays its weekly rent to the lessor; a lessee who cannot cover it
    /// loses the lease on the spot, the licence returning to the lessor with
    /// the quota. A lease that pays its last week closes.
    pub fn settle_leases(&mut self) -> Vec<String> {
        let mut lines = Vec::new();
        for mut lease in std::mem::take(&mut self.leases) {
            let lessee = lease.lessee.idx();
            if !rent_covered(self.port.gold[lessee], lease.weekly_rent) {
                self.release_licence(&lease);
                lines.push(format!(
                    "{} cannot pay the {} rent: the lease falls, {} takes the licence back.",
                    lease.lessee.name(),
                    fmt_gold(lease.weekly_rent as i64),
                    lease.lessor.name()
                ));
                continue;
            }
            self.port.gold[lessee] -= lease.weekly_rent as i64;
            self.port.gold[lease.lessor.idx()] += lease.weekly_rent as i64;
            lease.weeks_left = lease.weeks_left.saturating_sub(1);
            let left = if lease.weeks_left == 1 { "week" } else { "weeks" };
            lines.push(format!(
                "{} pays {} of rent to {}; {} {left} left.",
                lease.lessee.name(),
                fmt_gold(lease.weekly_rent as i64),
                lease.lessor.name(),
                lease.weeks_left
            ));
            if lease.weeks_left == 0 {
                self.release_licence(&lease);
                lines.push(format!(
                    "The lease ends: {} takes the licence back.",
                    lease.lessor.name()
                ));
            } else {
                self.leases.push(lease);
            }
        }
        lines
    }

    /// End every lease a captain is party to, licences going home first: a
    /// laid-up captain keeps no desk open, and nothing may be pooled twice.
    pub fn drop_leases(&mut self, actor: ActorId) -> Vec<String> {
        let mut lines = Vec::new();
        let mut kept = Vec::new();
        for lease in std::mem::take(&mut self.leases) {
            if lease.lessor != actor && lease.lessee != actor {
                kept.push(lease);
                continue;
            }
            self.release_licence(&lease);
            lines.push(format!("The lease between {} and {} lapses.", lease.lessor.name(), lease.lessee.name()));
        }
        self.leases = kept;
        lines
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
        if holder == ActorId::You {
            self.record_favour(borrower, crate::favours::SEIZE, "You seized his hull.");
        }
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
            close_weeks: None,
            ban_small_mesh: false,
            indemnity_per_licence_week: indemnity_gold.saturating_mul(100),
            funding: None,
            levy_per_crate: None,
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
