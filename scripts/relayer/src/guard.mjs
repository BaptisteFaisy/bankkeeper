// Guardrails of the sponsored relayer.
//
// The house holds the keys and pays the gas, so these dials are all that
// stands between a bored player and an empty treasury. Four of them:
//
//   1. a rate limit per caller (a burst is refused, not queued);
//   2. a spending cap per account (the house lends a purse once, and never
//      more than `TW_SEED_GOLD_MILLI`);
//   3. a budget of fresh captains per hour (a thousand emails must not
//      drain the house in a minute);
//   4. a ledger on disk, so a restart does not reset the caps.
//
// The ledger lives under TW_CHAIN_HOME (never in the repository) and holds
// counters only: no key, no email, no amount of NEAR.
import path from 'node:path';
import { paths, readJson, writeJson } from '../../sandbox/lib.mjs';

/** Calls one caller may make per minute (login, position, sponsored actions). */
export const RATE_LIMIT_PER_MIN = Number(process.env.TW_RATE_LIMIT_PER_MIN || 30);
/** Sponsored transactions one captain may trigger per hour. */
export const ACTION_LIMIT_PER_HOUR = Number(process.env.TW_ACTION_LIMIT_PER_HOUR || 200);
/** Milli-gold the house puts in a fresh captain's purse, once per account. */
export const SEED_GOLD_MILLI = Number(process.env.TW_SEED_GOLD_MILLI || 1_000_000);
/** Fresh captains the house may fund per hour, across every account. */
export const SEED_LIMIT_PER_HOUR = Number(process.env.TW_SEED_LIMIT_PER_HOUR || 50);

const calls = new Map();
const actions = new Map();

function prune(list, now, windowMs) {
  return list.filter((at) => now - at < windowMs);
}

function bump(store, key, now, windowMs, limit) {
  const list = prune(store.get(key) ?? [], now, windowMs);
  store.set(key, list);
  if (list.length >= limit) return false;
  list.push(now);
  store.set(key, list);
  return true;
}

/** Sliding window: at most `RATE_LIMIT_PER_MIN` calls per minute per key. */
export function allowCall(key, now = Date.now()) {
  return bump(calls, key, now, 60_000, RATE_LIMIT_PER_MIN);
}

/** Sliding window: at most `ACTION_LIMIT_PER_HOUR` sponsored actions. */
export function allowAction(key, now = Date.now()) {
  return bump(actions, key, now, 3_600_000, ACTION_LIMIT_PER_HOUR);
}

function ledgerPath() {
  return path.join(paths().home, 'ledger.json');
}

/** The counters: `{key: {seededMilli, actions, seeds: [timestamps]}}`. */
export function readLedger() {
  const data = readJson(ledgerPath(), {});
  return data && typeof data === 'object' ? data : {};
}

function writeLedger(ledger) {
  writeJson(ledgerPath(), ledger, 0o600);
}

function entryOf(ledger, key) {
  const entry = ledger[key];
  if (entry && typeof entry === 'object') return { seededMilli: 0, actions: 0, seeds: [], ...entry };
  return { seededMilli: 0, actions: 0, seeds: [] };
}

/** True when the house may still put `milli` in this captain's purse. */
export function allowSeed(key, milli, now = Date.now()) {
  const ledger = readLedger();
  const entry = entryOf(ledger, key);
  if (entry.seededMilli + milli > SEED_GOLD_MILLI) return false;
  const fresh = entry.seeds.filter((at) => now - at < 3_600_000);
  if (fresh.length >= SEED_LIMIT_PER_HOUR) return false;
  return true;
}

/** Remember what the house just lent, and to whom. */
export function recordSeed(key, milli, now = Date.now()) {
  const ledger = readLedger();
  const entry = entryOf(ledger, key);
  entry.seededMilli += milli;
  entry.seeds = [...entry.seeds.filter((at) => now - at < 3_600_000), now];
  ledger[key] = entry;
  writeLedger(ledger);
}

/** True when this captain may trigger one more sponsored transaction. */
export function allowSponsoredAction(key) {
  const ledger = readLedger();
  const entry = entryOf(ledger, key);
  return entry.actions < ACTION_LIMIT_PER_HOUR;
}

/** Count one sponsored transaction for this captain. */
export function recordAction(key) {
  const ledger = readLedger();
  const entry = entryOf(ledger, key);
  entry.actions += 1;
  ledger[key] = entry;
  writeLedger(ledger);
}
