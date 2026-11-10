# Two commands are all the testnet path needs. docs/deployments.md holds the
# state of the last run and every public hash; no key ever lands in the tree.
.PHONY: testnet-wasm testnet-deploy testnet-e2e

testnet-wasm:
	cd contracts/tidewater && cargo near build non-reproducible-wasm

testnet-deploy:
	node scripts/testnet/deploy.mjs

testnet-e2e:
	node scripts/testnet/e2e.mjs
