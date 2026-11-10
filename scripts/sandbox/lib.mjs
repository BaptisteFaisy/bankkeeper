// Shared plumbing for the local NEAR sandbox: paths, node control, accounts,
// deploys and view calls. Everything lives under TW_CHAIN_HOME
// (default ~/.tidewater-chain), never in the repository: the tree only ever
// holds code, never a key.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Account, JsonRpcProvider, KeyPair, actions, nearToYocto } from 'near-api-js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TGAS = 1_000_000_000_000n;

/** Where the chain state, the keys and the pid files live. */
export function paths() {
  const home = path.resolve(process.env.TW_CHAIN_HOME || path.join(os.homedir(), '.tidewater-chain'));
  const node = path.join(home, 'sandbox');
  return {
    home,
    node,
    nodePid: path.join(node, 'near-sandbox.pid'),
    nodeLog: path.join(node, 'node.log'),
    keys: path.join(home, 'keys'),
    players: path.join(home, 'players'),
    state: path.join(home, 'state.json'),
    relayerPid: path.join(home, 'relayer.pid'),
  };
}

export function ensureDirs() {
  const p = paths();
  for (const dir of [p.home, p.node, p.keys, p.players]) fs.mkdirSync(dir, { recursive: true });
  return p;
}

/** The sandbox binary: explicit env first, then the documented default. */
export function sandboxBin() {
  const candidates = [
    process.env.NEAR_SANDBOX_BIN,
    path.join(os.homedir(), 'mandat/.sandbox/near-sandbox'),
    '/usr/local/bin/near-sandbox',
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error('near-sandbox not found: set NEAR_SANDBOX_BIN to the binary');
  }
  return found;
}

export function sandboxPort() {
  return Number(process.env.TW_SANDBOX_PORT || 3030);
}

export function sandboxRpc() {
  return `http://127.0.0.1:${sandboxPort()}`;
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, value, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, mode ? { mode } : undefined);
}

export function readState() {
  return readJson(paths().state);
}

export function saveState(state) {
  writeJson(paths().state, state, 0o600);
  return state;
}

/** The relayer talks to whatever state.json says, unless env overrides it. */
export function chainConfig() {
  const state = readState();
  if (!state) throw new Error(`no chain state at ${paths().state}: run scripts/sandbox/start.mjs first`);
  return {
    rpcUrl: process.env.TW_RPC_URL || state.rpcUrl,
    contractId: process.env.TW_CONTRACT_ID || state.contractId,
    ownerAccount: process.env.TW_OWNER_ACCOUNT || state.ownerAccount,
    treasuryAccount: process.env.TW_TREASURY_ACCOUNT || state.treasuryAccount,
    masterAccount: process.env.TW_MASTER_ACCOUNT || state.masterAccount,
    playerAccount: process.env.TW_PLAYER_ACCOUNT || state.playerAccount,
    singleCaptain: state.singleCaptain !== false,
    accountSuffix: process.env.TW_ACCOUNT_SUFFIX || state.accountSuffix,
    networkId: process.env.TW_NETWORK_ID || state.networkId,
  };
}

let sharedProvider = null;

/** RPC first: explicit url, then env, then state.json, then the local sandbox. */
export function provider(rpcUrl) {
  if (rpcUrl) return new JsonRpcProvider({ url: rpcUrl });
  if (sharedProvider === null) {
    const url = process.env.TW_RPC_URL || readState()?.rpcUrl || sandboxRpc();
    sharedProvider = new JsonRpcProvider({ url });
  }
  return sharedProvider;
}

/** A credential file in the usual near-cli shape: account_id + secret_key. */
export function readKey(file) {
  const raw = readJson(file);
  if (!raw || !raw.secret_key) throw new Error(`no usable key at ${file}`);
  return raw;
}

export function saveKey(file, accountId, keyPair) {
  writeJson(file, { account_id: accountId, public_key: keyPair.getPublicKey().toString(), secret_key: keyPair.toString() }, 0o600);
  return file;
}

export function signer(keyFile, url) {
  const key = readKey(keyFile);
  if (!key.account_id) throw new Error(`key file ${keyFile} has no account_id`);
  // near-api-js v7 takes the secret key string here and builds its own signer.
  return new Account(key.account_id, provider(url), key.secret_key);
}

export async function view(contractId, method, args = {}, url) {
  return provider(url).callFunction({ contractId, method, args });
}

export function txHash(res) {
  return res?.transaction_outcome?.id
    ?? res?.final_execution_outcome?.transaction_outcome?.id
    ?? res?.transaction?.hash
    ?? null;
}

export async function send(account, contractId, method, args = {}, { gas = 100n * TGAS, deposit = 0n } = {}) {
  const res = await account.signAndSendTransaction({
    receiverId: contractId,
    actions: [actions.functionCall(method, args, BigInt(gas), BigInt(deposit))],
    waitUntil: 'FINAL',
    throwOnFailure: true,
  });
  return { hash: txHash(res), outcome: res };
}

export async function accountExists(accountId, url) {
  try {
    await provider(url).viewAccount({ accountId, finalityQuery: { finality: 'final' } });
    return true;
  } catch {
    return false;
  }
}

export function newKeyPair() {
  return KeyPair.fromRandom('ed25519');
}

/** Create `accountId` with a fresh key; returns the saved credential file. */
export async function createAccount(master, accountId, near = '50', url) {
  const keyPair = newKeyPair();
  await master.signAndSendTransaction({
    receiverId: accountId,
    actions: [
      actions.createAccount(),
      actions.transfer(BigInt(nearToYocto(near))),
      actions.addFullAccessKey(keyPair.getPublicKey()),
    ],
    waitUntil: 'FINAL',
    throwOnFailure: true,
  });
  return { keyPair, file: saveKey(path.join(paths().keys, `${accountId}.json`), accountId, keyPair) };
}

export async function rpcUp(url = sandboxRpc(), timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'ping', method: 'status', params: [] }),
        signal: AbortSignal.timeout(2_000),
      });
      const body = await res.json();
      if (body.result?.sync_info) return body.result;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`NEAR RPC did not answer on ${url} within ${Math.round(timeoutMs / 1000)}s`);
}

export function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function pidFrom(file) {
  const raw = readJson(file);
  return raw && alive(raw.pid) ? raw.pid : null;
}

/** Start the node in its own session so it survives this script. */
export function spawnNode(bin, home, logFile) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const out = fs.openSync(logFile, 'a');
  const child = spawn(bin, ['--home', home, 'run'], {
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, NO_COLOR: '1' },
  });
  child.unref();
  return child.pid;
}
