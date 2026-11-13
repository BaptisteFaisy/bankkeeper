// Chain home for a serverless host: the only writable place is /tmp.
//
// The relayer reads two things from disk — the chain `state.json` and the
// captain's key file — and on a function host neither can live in the
// repository (the tree holds code, never a key) nor survive between calls.
// So each cold start rebuilds them under /tmp from two encrypted environment
// variables set on the host:
//
//   TW_CHAIN_STATE  the state.json contents (contract, accounts, rpc, suffix)
//   TW_PLAYER_KEY   the credential file of the signing account
//
// Nothing is logged here, and nothing is written outside the temp directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Where the rebuilt chain home lives on this instance. */
export const SERVERLESS_HOME = path.join(os.tmpdir(), 'tidewater-chain');

function parseJson(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`E_CONFIG: ${name} is not set on this host`);
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`E_CONFIG: ${name} is not valid JSON`);
  }
}

/** Write the two files the relayer reads, then point TW_CHAIN_HOME at them. */
export function bootstrapChainHome(env = process.env) {
  if (env.TW_CHAIN_HOME !== undefined && env.TW_CHAIN_HOME !== '') return env.TW_CHAIN_HOME;
  const state = parseJson(env.TW_CHAIN_STATE, 'TW_CHAIN_STATE');
  const key = parseJson(env.TW_PLAYER_KEY, 'TW_PLAYER_KEY');
  if (typeof key.account_id !== 'string' || typeof key.secret_key !== 'string') {
    throw new Error('E_CONFIG: TW_PLAYER_KEY has no account_id and secret_key');
  }
  const keys = path.join(SERVERLESS_HOME, 'keys');
  fs.mkdirSync(keys, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(SERVERLESS_HOME, 'state.json'), `${JSON.stringify(state)}\n`, { mode: 0o600 });
  fs.writeFileSync(path.join(keys, `${key.account_id}.json`), `${JSON.stringify(key)}\n`, { mode: 0o600 });
  env.TW_CHAIN_HOME = SERVERLESS_HOME;
  return SERVERLESS_HOME;
}
