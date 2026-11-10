# Two commands are all the testnet path needs. docs/deployments.md holds the
# state of the last run and every public hash; no key ever lands in the tree.
.PHONY: testnet-wasm testnet-deploy testnet-e2e balance

testnet-wasm:
	cd contracts/tidewater && cargo near build non-reproducible-wasm

testnet-deploy:
	node scripts/testnet/deploy.mjs

testnet-e2e:
	node scripts/testnet/e2e.mjs

# Balance harness: 50 seeds x 4 player policies x a campaign of 3 seasons.
# Writes docs/balance-50.json and prints the summary table. About four seconds
# of play once the release binary is built (a cold build adds ~70 s).
balance:
	cargo build --release --quiet -p sim
	./target/release/sim harness --seeds 50 --seasons 3 --json docs/balance-50.json
