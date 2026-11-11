//! Audit of the `tidewater` contract — executable proofs, one test per defect.
//!
//! Every `dNN_*` test FAILS while the defect it names is present and PASSES
//! once the defect is fixed. The ones still `#[ignore]`d name the defect that
//! is still open; the rest run in CI. Run the whole file with:
//!
//! ```text
//! cargo test -p tidewater --test audit
//! cargo test -p tidewater --test audit -- --ignored   # the open defects
//! ```
//!
//! The `sane_*` tests are regression guards for invariants that DO hold today
//! (gold conservation, guard codes, atomic landings); they run in CI.
//!
//! Cross-references and severities: `docs/AUDIT-CONTRACT.md`.

mod harness;

mod defects_a;
mod defects_b;
mod guards;
