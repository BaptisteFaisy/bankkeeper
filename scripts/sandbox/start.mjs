#!/usr/bin/env node
// `node scripts/sandbox/start.mjs [--reset]` — one local NEAR chain, ready for
// the relayer. Idempotent: rerun it and it only does what is missing.
//
// The node binary is not vendored; point NEAR_SANDBOX_BIN at it (default
// ~/mandat/.sandbox/near-sandbox). Chain state and keys live under
// TW_CHAIN_HOME (default ~/.tidewater-chain), never in the repo.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { actions } from 'near-api-js';
import {
  ROOT, createAccount, ensureDirs, paths, provider, rpcUp, sandboxBin,
  sandboxPort, sandboxRpc, saveState, send, signer, spawnNode, view, readJson,
} from './lib.mjs';

const WASM = process.env.TW_WASM || path.join(ROOT, 'target/near/tidewater/tidewater.wasm');
const NETWORK_ID = process.env.TW_NETWORK_ID || 'localnet';

function suffix() {
  return process.env.TW_ACCOUNT_SUFFIX || 'test.near';
}

// Four roles, four accounts:
//   contract  the contract itself, and the owner that runs the days
//   player    the captain the constructor seeds (gold, licences, two deeds)
//   house     the purse: it funds captains' gold and gas, so `player` can be
//             left to the bankruptcy the bank needs to hold a licence
//   bank      a plain dev account; the in-game bank is the owner `npc:bank`
function ids() {
  const s = suffix();
  return {
    master: process.env.TW_MASTER_ACCOUNT || 'test.near',
    contract: process.env.TW_CONTRACT_ID || `tidewater.${s}`,
    player: process.env.TW_PLAYER_ACCOUNT || `player.${s}`,
    house: process.env.TW_TREASURY_ACCOUNT || `house.${s}`,
    bank: process.env.TW_BANK_ACCOUNT || `bank.${s}`,
  };
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** `init` writes genesis.json once; rerunning it would wipe nothing but is slow. */
function initialiseNode(bin) {
  const p = ensureDirs();
  if (!fs.existsSync(path.join(p.node, 'genesis.json'))) {
    console.log('• initialising the sandbox genesis (one off)');
    execFileSync(bin, ['--home', p.node, 'init'], { stdio: 'inherit' });
  }
  // Local chain only: no boot nodes, and the port the relayer expects.
  const configFile = path.join(p.node, 'config.json');
  const config = readJson(configFile);
  if (config) {
    const want = `127.0.0.1:${sandboxPort()}`;
    config.network = { ...config.network, boot_nodes: '' };
    // The p2p port is a fixed 24567 by default: two sandboxes on the same
    // machine would fight for it. TW_SANDBOX_NETWORK_PORT gives it its own.
    const networkPort = process.env.TW_SANDBOX_NETWORK_PORT;
    if (networkPort) config.network.addr = `127.0.0.1:${networkPort}`;
    if (config.rpc?.addr !== want) config.rpc = { ...config.rpc, addr: want };
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  }
}

/** The port may carry a foreign chain: compare the genesis id before trusting it. */
async function ourChainAnswering(home) {
  const genesis = readJson(path.join(home, 'genesis.json'));
  if (!genesis?.chain_id) return false;
  const status = await rpcUp(sandboxRpc(), 2_000).catch(() => null);
  if (status === null) return false;
  if (status.chain_id !== genesis.chain_id) {
    throw new Error(`port ${sandboxPort()} runs chain ${status.chain_id}, not ours (${genesis.chain_id}): set TW_SANDBOX_PORT`);
  }
  return true;
}

async function ensureNode(bin) {
  const p = ensureDirs();
  if (await ourChainAnswering(p.node)) {
    console.log(`• node already listening on ${sandboxRpc()}`);
    return;
  }
  const pid = spawnNode(bin, p.node, p.nodeLog);
  fs.writeFileSync(p.nodePid, `${JSON.stringify({ pid, startedAt: new Date().toISOString() })}\n`);
  console.log(`• node starting (pid ${pid}, log ${p.nodeLog})`);
  const status = await rpcUp(sandboxRpc(), 150_000);
  console.log(`• node up: chain ${status.chain_id}, protocol ${status.latest_protocol_version}`);
}

/** Master account: the genesis validator on sandbox, the deployer on testnet. */
function masterSigner() {
  const p = paths();
  const file = process.env.TW_MASTER_KEY_FILE || path.join(p.node, 'validator_key.json');
  return signer(file, sandboxRpc());
}

async function ensureAccount(master, accountId, near) {
  const p = paths();
  const keyFile = path.join(p.keys, `${accountId}.json`);
  if (fs.existsSync(keyFile) && readJson(keyFile)?.account_id === accountId) {
    const there = await provider(sandboxRpc()).viewAccount({ accountId, finalityQuery: { finality: 'final' } }).then(() => true).catch(() => false);
    if (there) return keyFile;
  }
  const created = await createAccount(master, accountId, near, sandboxRpc());
  console.log(`• account ${accountId} created (${near} NEAR)`);
  return created.file;
}

async function deployAndInit(ids, state) {
  const ownerFile = path.join(paths().keys, `${ids.contract}.json`);
  const owner = signer(ownerFile, sandboxRpc());
  const digest = sha256(WASM);
  let initialised = await view(ids.contract, 'get_day', {}, sandboxRpc()).then(() => true).catch(() => false);
  if (state?.wasmSha256 !== digest || !initialised) {
    const code = fs.readFileSync(WASM);
    await owner.signAndSendTransaction({
      receiverId: ids.contract,
      actions: [actions.deployContract(code)],
      waitUntil: 'FINAL',
      throwOnFailure: true,
    });
    console.log(`• wasm deployed to ${ids.contract} (${Math.round(fs.statSync(WASM).size / 1024)} KiB)`);
    // A redeploy keeps the state: only a fresh account needs `new`.
    initialised = await view(ids.contract, 'get_day', {}, sandboxRpc()).then(() => true).catch(() => false);
  }
  if (!initialised) {
    const { hash } = await send(owner, ids.contract, 'new', { owner: ids.contract, player: ids.player });
    console.log(`• contract initialised: new(owner=${ids.contract}, player=${ids.player}) ${hash}`);
  }
  return digest;
}

async function main() {
  const reset = process.argv.includes('--reset');
  const p = ensureDirs();
  if (reset && fs.existsSync(p.state)) {
    fs.rmSync(p.state, { force: true });
    console.log('• state.json removed (node and keys kept)');
  }
  if (!fs.existsSync(WASM)) {
    throw new Error(`contract wasm missing at ${WASM} — run: cd contracts/tidewater && cargo near build non-reproducible-wasm`);
  }
  const bin = sandboxBin();
  initialiseNode(bin);
  await ensureNode(bin);

  const master = masterSigner();
  const names = ids();
  const previous = readJson(p.state, null);
  await ensureAccount(master, names.contract, '100');
  await ensureAccount(master, names.player, '50');
  await ensureAccount(master, names.house, '60');
  await ensureAccount(master, names.bank, '10');
  const digest = await deployAndInit(names, previous);

  const day = await view(names.contract, 'get_day', {}, sandboxRpc());
  const state = {
    networkId: NETWORK_ID,
    rpcUrl: sandboxRpc(),
    contractId: names.contract,
    ownerAccount: names.contract,
    treasuryAccount: names.house,
    playerAccount: names.player,
    // One NEAR account can hold gold on this contract: see docs/ONCHAIN.md.
    singleCaptain: process.env.TW_SINGLE_CAPTAIN !== '0',
    bankAccount: names.bank,
    masterAccount: names.master,
    accountSuffix: suffix(),
    wasmPath: WASM,
    wasmSha256: digest,
    day: Number(day.day),
    updatedAt: new Date().toISOString(),
  };
  saveState(state);
  const balance = await view(names.contract, 'mt_balance_of', { account_id: names.player, token_id: '0' }, sandboxRpc());
  console.log('');
  console.log(`contract  ${state.contractId}  (day ${state.day}, seeded captain ${balance} milli-gold)`);
  console.log(`house     ${state.treasuryAccount}  · seeded captain ${state.playerAccount} · dev bank ${state.bankAccount}`);
  console.log(`rpc       ${state.rpcUrl}`);
  console.log(`state     ${p.state}`);
  console.log('next: node scripts/relayer/src/relayer.mjs');
}

main().catch((error) => {
  console.error(`sandbox failed: ${error.message}`);
  process.exitCode = 1;
});
