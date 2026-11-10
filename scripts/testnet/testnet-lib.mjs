// Shared plumbing for the Tidewater testnet deploy and the end-to-end replay.
//
// Accounts come from the public testnet faucet with a key we generate here, and
// the key material is written in the standard
// ~/.near-credentials/testnet/<account>.json format, outside the repository.
// Nothing secret ever lands in the tree: docs/deployments.md only holds public
// addresses and transaction hashes.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Account, JsonRpcProvider, KeyPair, PublicKey, actions, nearToYocto } from "near-api-js";

export const RPC = process.env.NEAR_NODE_URL ?? "https://rpc.testnet.fastnear.com";
export const FAUCET = "https://helper.testnet.near.org/account";
export const CREDS = path.join(os.homedir(), ".near-credentials", "testnet");
export const FORCE = process.env.FORCE_REDEPLOY === "1";
export const ROOT_DIR = path.resolve(import.meta.dirname, "../..");

/// The contract account is also the owner (it pilots NPC boats and runs the
/// day), and it is the only account that ever talks to the faucet.
///
/// Nominal path: `${prefix}.testnet`, created by the public faucet. When the
/// faucet is rate-limited (HTTP 429), set TIDEWATER_ROOT_PARENT to a funded
/// testnet account and the very same contract account is created as one of its
/// subaccounts instead — nothing else changes, and the deployment is reversible
/// (deleteAccount refunds the code storage).
const PREFIX = process.env.TIDEWATER_TESTNET_PREFIX ?? "bankkeeper";
const PARENT = process.env.TIDEWATER_ROOT_PARENT ?? null;
const ROOT = PARENT ? `${PREFIX}.${PARENT}` : `${PREFIX}.testnet`;

export const ids = {
  contract: ROOT,
  player: `player.${ROOT}`,
  captain: `captain.${ROOT}`,
  bank: `bank.${ROOT}`,
};

export const root = { id: ROOT, prefix: PREFIX, parent: PARENT };

export const WASM = path.join(ROOT_DIR, "target/near/tidewater/tidewater.wasm");
export const DOCS = path.join(ROOT_DIR, "docs");

/// 1 Tgas is pre-charged against the signer, so stay lean: 100 Tgas covers
/// every entry point here, `run_day` included.
export const CALL_GAS = 100n * 10n ** 12n;
export const ONE_YOCTO = 1n;
export const NEAR = 10n ** 24n;

export const provider = new JsonRpcProvider({ url: RPC });

// ------------------------------------------------------------------- accounts

export function credPath(accountId) {
  return path.join(CREDS, `${accountId}.json`);
}

export function hasKey(accountId) {
  return fs.existsSync(credPath(accountId));
}

function secretOf(accountId) {
  const raw = JSON.parse(fs.readFileSync(credPath(accountId), "utf8"));
  return raw.secret_key ?? raw.private_key;
}

export function readKey(accountId) {
  return KeyPair.fromString(secretOf(accountId));
}

export function signer(accountId) {
  if (!hasKey(accountId)) throw new Error(`no key for ${accountId} in ${CREDS}`);
  return new Account(accountId, provider, secretOf(accountId));
}

function saveKey(accountId, keyPair) {
  fs.mkdirSync(CREDS, { recursive: true });
  fs.writeFileSync(
    credPath(accountId),
    JSON.stringify(
      {
        account_id: accountId,
        public_key: keyPair.getPublicKey().toString(),
        secret_key: keyPair.toString(),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}

export async function accountExists(accountId) {
  try {
    await provider.viewAccount({ accountId });
    return true;
  } catch {
    return false;
  }
}

/** Creates the top-level account through the faucet: 10 NEAR, one call total. */
export async function ensureTopLevel(accountId) {
  if (await accountExists(accountId)) {
    if (!hasKey(accountId)) throw new Error(`${accountId} exists but has no key in ${CREDS}`);
    return { created: false, accountId };
  }
  const keyPair = hasKey(accountId) ? readKey(accountId) : KeyPair.fromRandom("ed25519");
  const response = await fetch(FAUCET, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      newAccountId: accountId,
      newAccountPublicKey: keyPair.getPublicKey().toString(),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status?.Failure) {
    throw new Error(
      `faucet refused ${accountId} (${response.status}): ${JSON.stringify(payload).slice(0, 300)}`,
    );
  }
  saveKey(accountId, keyPair);
  await waitForAccount(accountId);
  return { created: true, accountId };
}

/** Creates the contract account: from the faucet, or under TIDEWATER_ROOT_PARENT. */
export async function ensureRoot(near = 5.6) {
  if (PARENT) {
    const result = await ensureSubaccount(ROOT, PARENT, near);
    return { ...result, mode: "subaccount", parent: PARENT, prefix: PREFIX };
  }
  try {
    const result = await ensureTopLevel(ROOT);
    return { ...result, mode: "faucet" };
  } catch (error) {
    if (!/faucet refused/.test(error.message)) throw error;
    throw new Error(
      `${error.message}\n  The public faucet allows 10 accounts per 3 h per IP; it is currently exhausted.\n` +
        `  Wait for the window to reset, or re-run against a funded parent account:\n` +
        `    TIDEWATER_ROOT_PARENT=<funded.testnet> node scripts/testnet/deploy.mjs`,
    );
  }
}

/** Creates `accountId` as a subaccount of `parentId`, funded for storage. */
export async function ensureSubaccount(accountId, parentId, near = 3) {
  if (await accountExists(accountId)) {
    if (!hasKey(accountId)) throw new Error(`${accountId} exists but has no key in ${CREDS}`);
    return { created: false, accountId };
  }
  const keyPair = hasKey(accountId) ? readKey(accountId) : KeyPair.fromRandom("ed25519");
  const outcome = await signer(parentId).signAndSendTransaction({
    receiverId: accountId,
    actions: [
      actions.createAccount(),
      actions.transfer(BigInt(nearToYocto(near))),
      actions.addFullAccessKey(PublicKey.from(keyPair.getPublicKey().toString())),
    ],
    waitUntil: "FINAL",
  });
  if (outcome?.status?.Failure) {
    throw new Error(`could not create ${accountId}: ${JSON.stringify(outcome.status).slice(0, 300)}`);
  }
  saveKey(accountId, keyPair);
  await waitForAccount(accountId);
  return { created: true, accountId };
}

async function waitForAccount(accountId, tries = 30) {
  for (let i = 0; i < tries; i += 1) {
    if (await accountExists(accountId)) return;
    await sleep(1000);
  }
  throw new Error(`${accountId} never appeared on chain`);
}

export async function nearBalance(accountId) {
  return BigInt((await provider.viewAccount({ accountId })).amount);
}

// ------------------------------------------------------------------- calls

/**
 * Sends one transaction and never throws on contract failure: callers want the
 * error code, not a stack trace. Returns { ok, txHash, logs, value, error }.
 */
export async function call(account, contractId, methodName, args = {}, options = {}) {
  const { deposit = 0n, gas = CALL_GAS } = options;
  try {
    const outcome = await account.signAndSendTransaction({
      receiverId: contractId,
      actions: [actions.functionCall(methodName, args, gas, deposit)],
      waitUntil: "FINAL",
    });
    const logs = (outcome?.receipts_outcome ?? []).flatMap((r) => r?.outcome?.logs ?? []);
    const status = outcome?.status ?? {};
    const ok = !status?.Failure;
    return {
      ok,
      txHash: outcome?.transaction_outcome?.id ?? null,
      logs,
      value: ok ? decode(status?.SuccessValue) : undefined,
      error: ok ? null : errorCode({ receipts_outcome: outcome?.receipts_outcome, status }),
      raw: ok ? undefined : status,
    };
  } catch (error) {
    return {
      ok: false,
      txHash: error?.context?.transaction_outcome?.id ?? null,
      logs: [],
      error: errorCode(error) ?? String(error?.message ?? error).slice(0, 300),
      raw: error,
    };
  }
}

function decode(successValue) {
  if (successValue === undefined || successValue === "") return undefined;
  try {
    return JSON.parse(Buffer.from(successValue, "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

/** near-api-js 7 names the field `method`, not `methodName`. */
export async function view(contractId, method, args = {}) {
  return provider.callFunction({ contractId, method, args, blockQuery: { finality: "final" } });
}

/** Pulls a contract error code (E_…) out of whatever near-api-js throws. */
export function errorCode(source) {
  const receipts =
    source?.context?.receipts_outcome ?? source?.result?.receipts_outcome ?? source?.receipts_outcome ?? [];
  const logs = receipts.flatMap((r) => r?.outcome?.logs ?? []);
  const haystack = [...logs, String(source?.message ?? ""), safeJson(source?.status ?? {})].join(" ");
  const match = haystack.match(/E_[A-Z_]+/);
  if (match) return match[0];
  const failure = source?.status?.Failure;
  if (failure) return safeJson(failure).slice(0, 200);
  return null;
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "";
  }
}

export async function deployWasm(account, wasmPath) {
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`missing ${wasmPath} — run: (cd contracts/tidewater && cargo near build non-reproducible-wasm)`);
  }
  const code = new Uint8Array(fs.readFileSync(wasmPath));
  const outcome = await account.signAndSendTransaction({
    receiverId: account.accountId,
    actions: [actions.deployContract(code)],
    waitUntil: "FINAL",
  });
  return outcome?.transaction_outcome?.id ?? null;
}

// ------------------------------------------------------------------- display

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Truncates a hash for readable transcripts. */
export function short(hash) {
  if (!hash) return "—";
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}

/** Milli-gold as a one-decimal string, the same way the contract prints it. */
export function gold(milli) {
  const value = BigInt(milli ?? 0);
  return `${value / 1000n}.${((value % 1000n) / 100n).toString()} gold`;
}

export function near(yocto) {
  return `${(Number(yocto) / 1e24).toFixed(3)} NEAR`;
}

export function wasmSize(bytes) {
  return `${(bytes / 1024).toFixed(0)} KiB`;
}
