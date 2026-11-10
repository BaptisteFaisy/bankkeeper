//! Round 3 B3: each landing records the net actually fished.
//!
//! The ledger used to label past landings with the boat's current net; the
//! landing now carries the post-ban mesh it really fished.

use rules::state::{ActorId, Mesh, Zone};
use sim::cycle::run_day;
use sim::seed_game;

/// Landings keep the fished mesh, including the post-ban override to large.
#[test]
fn landings_record_the_mesh_actually_fished() {
    let mut game = seed_game(7);
    game.assign_boat(ActorId::You, 0, None, Mesh::Large).unwrap();
    game.assign_boat(ActorId::You, 0, None, Mesh::Small).unwrap();
    game.assign_boat(ActorId::You, 0, Some(Zone::Shallows), Mesh::Small).unwrap();
    let open = run_day(&mut game);
    let small = open.landings.iter().find(|landing| landing.boat == 0).expect("boat 0 lands");
    assert_eq!(small.mesh, Mesh::Small);
    game.small_mesh_banned = true;
    let banned = run_day(&mut game);
    let large = banned.landings.iter().find(|landing| landing.boat == 0).expect("boat 0 lands");
    assert_eq!(large.mesh, Mesh::Large);
}
