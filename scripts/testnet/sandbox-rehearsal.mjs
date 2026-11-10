#!/usr/bin/env node
// `node scripts/testnet/sandbox-rehearsal.mjs` — the testnet deployment
// rehearsed on a LOCAL near-sandbox chain, so the real one is a single shot.
//
// What it does, in order:
//   1. brings up a local NEAR node (scripts/sandbox/start.mjs) — no network;
//   2. gives the rehearsal its own HOME, so the sandbox credentials never
//      touch ~/.near-credentials/testnet and never enter the tree;
//   3. runs `node scripts/testnet/deploy.mjs` — the very script the testnet
//      run uses — against the local RPC, with TIDEWATER_ROOT_PARENT set to
//      the sandbox's funded parent: that is the documented fallback for the
//      day the public faucet answers 429;
//   4. tops the accounts up: the sandbox burns gas 1000 times faster than
//      testnet (1e9 yoctoNEAR per gas unit), so the hundred prepaid Tgas of
//      a call cost 0.1 NEAR there and 0.0001 NEAR on testnet;
//   5. mutation check: the scenario with the hash recording removed must
//      FAIL, otherwise the proof table could silently come out empty;
//   6. resets the chain and re-deploys, then runs
//      `node scripts/testnet/e2e.mjs` — the very scenario, unmodified;
//   7. checks the proof table: one row per transaction, and not empty.
//
// The public testnet is unreachable from here by construction: a fetch guard
// (written next to this file, loaded through NODE_OPTIONS) refuses every
// outbound call that is not local, so the faucet cannot be called even by
// accident.
//
// Run: node scripts/testnet/sandbox-rehearsal.mjs
// Exit 1 on any failed step — a scenario that does not pass is never green.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
/** The real HOME, captured before the rehearsal replaces it with its own. */
const REAL_HOME = os.homedir();
const SCRATCH = process.env.TW_REHEARSAL_HOME ?? "/tmp/tw-sandbox-rehearsal";
const CHAIN_HOME = path.join(SCRATCH, "chain");
const FAKE_HOME = path.join(SCRATCH, "home");
const PORT = Number(process.env.TW_SANDBOX_PORT ?? 3033);
const NET_PORT = Number(process.env.TW_SANDBOX_NETWORK_PORT ?? PORT + 100);
const RPC = `http://127.0.0.1:${PORT}`;
/** The sandbox's genesis validator: a funded parent, like a real testnet one. */
const PARENT = process.env.TW_REHEARSAL_PARENT ?? "test.near";
const PREFIX = process.env.TW_REHEARSAL_PREFIX ?? "bankkeeper";
const CREDS = path.join(FAKE_HOME, ".near-credentials", "testnet");
/** Gas dust, in NEAR: enough for a hundred prepaid calls on the sandbox. */
const TOP_UP = 5;
/** The message e2e.mjs prints when a transaction left no hash behind. */
const GUARD = "every transaction left a hash";

// The rehearsal's own environment, before anything else reads it: the
// credentials go to the scratch HOME and the RPC points at the local node.
process.env.HOME = FAKE_HOME;
process.env.NEAR_NODE_URL = RPC;
process.env.TIDEWATER_ROOT_PARENT = PARENT;
process.env.TIDEWATER_TESTNET_PREFIX = PREFIX;

const { ids, signer } = await import("./testnet-lib.mjs");
const { transferNear } = await import("../sandbox/lib.mjs");

/** Refuses every outbound call that is not local: the faucet stays out. */
const FETCH_GUARD = `
const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input : (input?.url ?? String(input));
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error("REHEARSAL GUARD: refusing the outbound call to " + host);
  }
  return original(input, init);
};
`;

function say(text) {
  console.log(text);
}

/** Runs a node script, echoing its output and keeping it for the checks. */
function run(script, env) {
  const result = spawn(process.execPath, [script], {
    cwd: ROOT,
    env,
    stdio: ["inherit", "pipe", "pipe"],
  });
  let output = "";
  const tee = (chunk) => {
    output += chunk;
    process.stdout.write(chunk);
  };
  result.stdout.on("data", tee);
  result.stderr.on("data", tee);
  return new Promise((resolve) => {
    result.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

/** The environment of the two testnet scripts, pointed at the local chain. */
function rehearsalEnv() {
  const guard = path.join(SCRATCH, "fetch-guard.mjs");
  return {
    ...process.env,
    HOME: FAKE_HOME,
    NEAR_NODE_URL: RPC,
    TIDEWATER_ROOT_PARENT: PARENT,
    TIDEWATER_TESTNET_PREFIX: PREFIX,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${guard}`.trim(),
  };
}

/** The funded parent credential, in the shape testnet-lib.mjs expects. */
function installParentKey() {
  const source = path.join(CHAIN_HOME, "sandbox", "validator_key.json");
  if (!fs.existsSync(source)) throw new Error(`no sandbox validator key at ${source}`);
  const raw = JSON.parse(fs.readFileSync(source, "utf8"));
  fs.mkdirSync(CREDS, { recursive: true });
  fs.writeFileSync(
    path.join(CREDS, `${PARENT}.json`),
    JSON.stringify(
      { account_id: raw.account_id, public_key: raw.public_key, secret_key: raw.secret_key },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  return raw.account_id;
}

function prepare() {
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, "fetch-guard.mjs"), FETCH_GUARD);
  say(`• scratch ${SCRATCH} (chain ${CHAIN_HOME}, home ${FAKE_HOME})`);
}

/** Gas dust from the funded parent: the sandbox charges 1000 times more. */
async function topUp() {
  const parent = signer(PARENT);
  for (const accountId of [ids.contract, ids.player, ids.captain, ids.bank]) {
    await transferNear(parent, accountId, TOP_UP);
    say(`• ${accountId} topped up with ${TOP_UP} NEAR`);
  }
}

/**
 * The mutation: e2e.mjs without the hash recording. The scenario must fail
 * on the guard, and on nothing else — a failure anywhere else would mean the
 * mutation test proves nothing.
 */
async function checkGuard(env) {
  const source = fs.readFileSync(path.join(HERE, "e2e.mjs"), "utf8");
  const mutated = source
    .replace(/^\s*if \(result\.txHash\) hashes\.push\([^)]*\);\n/m, "")
    .replace('from "./testnet-lib.mjs"', `from "${path.join(HERE, "testnet-lib.mjs")}"`);
  if (mutated.includes("hashes.push")) throw new Error("the mutation did not apply: the push line moved");
  const mutant = path.join(SCRATCH, "e2e-without-hashes.mjs");
  fs.writeFileSync(mutant, mutated);
  const result = await run(mutant, env);
  if (result.code === 0) throw new Error("the scenario passed without recording a single hash");
  if (!result.output.includes(GUARD)) {
    throw new Error(`the mutated scenario failed on the wrong thing: ${result.output.slice(-400)}`);
  }
  say(`• the scenario without the hash recording fails on "${GUARD}", as it must`);
}

/** The block e2e.mjs writes between the two markers of docs/deployments.md. */
function proofBlock() {
  const file = path.join(ROOT, "docs", "deployments.md");
  const doc = fs.readFileSync(file, "utf8");
  const match = doc.match(/<!-- e2e:begin -->[\s\S]*?<!-- e2e:end -->/);
  if (!match) throw new Error("docs/deployments.md has no e2e:begin / e2e:end block");
  return match[0];
}

function proofRows(block) {
  return block
    .split("\n")
    .filter((line) => line.startsWith("| ") && line.includes("`") && !line.startsWith("| Transaction"))
    .map((line) => line.split("|")[1].trim());
}

function proofHashes(block) {
  return block
    .split("\n")
    .filter((line) => line.startsWith("| ") && line.includes("`"))
    .map((line) => line.split("`")[1] ?? "")
    .filter((hash) => hash.length > 0);
}

/** The transcript e2e.mjs writes: it must end on "all steps passed". */
function transcriptTail() {
  const file = path.join(ROOT, "docs", "e2e-testnet.log");
  if (!fs.existsSync(file)) throw new Error(`no transcript at ${file}`);
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  return lines[lines.length - 1];
}

function report(block) {
  const rows = proofRows(block);
  const hashes = proofHashes(block);
  say("");
  say("  proof table (sandbox):");
  for (const row of rows) say(`    ${row}`);
  say("");
  say(`  ${rows.length} transactions, ${new Set(hashes).size} distinct hashes`);
}

/**
 * A fresh chain: stop the previous node, wipe the scratch node home and the
 * scratch credentials, then start over. `FORCE_REDEPLOY=1` is not an option
 * here — deploying code does NOT wipe the contract state, so re-running
 * `new` panics with "The contract has already been initialized" (see
 * docs/TESTNET-RUN.md). A reset is the only way back to day 0.
 */
async function bringUpChain() {
  await run(path.join(ROOT, "scripts", "sandbox", "stop.mjs"), chainEnv());
  for (const target of [CHAIN_HOME, CREDS]) {
    if (path.resolve(target).startsWith(path.resolve(SCRATCH))) fs.rmSync(target, { recursive: true, force: true });
  }
  const chain = await run(path.join(ROOT, "scripts", "sandbox", "start.mjs"), chainEnv());
  if (chain.code !== 0) throw new Error("the local chain did not come up");
  say(`• funded parent ${installParentKey()} (credential copied to the scratch HOME)`);
}

function chainEnv() {
  const bin =
    process.env.NEAR_SANDBOX_BIN ?? path.join(REAL_HOME, ".local/near-sandbox/near-sandbox");
  return {
    ...process.env,
    HOME: FAKE_HOME,
    NEAR_SANDBOX_BIN: bin,
    TW_CHAIN_HOME: CHAIN_HOME,
    TW_SANDBOX_PORT: String(PORT),
    TW_SANDBOX_NETWORK_PORT: String(NET_PORT),
  };
}

async function deploy(env) {
  const result = await run(path.join(HERE, "deploy.mjs"), env);
  if (result.code !== 0) throw new Error("deploy.mjs failed on the sandbox");
}

async function main() {
  if (!RPC.startsWith("http://127.0.0.1")) throw new Error(`the rehearsal never leaves localhost: ${RPC}`);
  prepare();
  const env = rehearsalEnv();

  say("• bringing up the local chain");
  await bringUpChain();

  say("• node scripts/testnet/deploy.mjs — on the local chain");
  await deploy(env);
  await topUp();

  say("• mutation check: the scenario without the hash recording must fail");
  await checkGuard(env);

  say("• a second, pristine chain: the real scenario has to start at day 0");
  await bringUpChain();
  await deploy(env);
  await topUp();

  say("• node scripts/testnet/e2e.mjs — the scenario, on the local chain");
  const played = await run(path.join(HERE, "e2e.mjs"), env);
  if (played.code !== 0) throw new Error("e2e.mjs failed on the sandbox");

  const tail = transcriptTail();
  if (!tail.includes("all steps passed")) throw new Error(`the transcript ends on "${tail}"`);
  const block = proofBlock();
  const rows = proofRows(block);
  if (rows.length === 0) throw new Error("the proof table is empty: the hashes were not recorded");
  report(block);
  say(`  transcript: docs/e2e-testnet.log (${tail})`);
}

main().catch((error) => {
  console.error(`\nrehearsal failed: ${error.message}`);
  process.exitCode = 1;
});
