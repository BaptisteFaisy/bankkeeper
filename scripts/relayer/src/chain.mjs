// Key custody and chain actions for the sponsored relayer.
//
// The player never sees a wallet: an email maps to a NEAR account whose
// full-access key lives server-side under TW_CHAIN_HOME/players. The relayer
// signs with that key and pays the gas, so the browser only ever gets a hash
// and the new balance. Nothing here returns a secret key.
import fs from 'node:fs';
import path from 'node:path';
import { getTransactionLastResult } from 'near-api-js';
import {
  accountExists, chainConfig, createAccount, paths, readKey,
  send, signer, transferNear, view, viewAccountBalance,
} from '../../sandbox/lib.mjs';
import { accountKey, emailHash, normaliseEmail } from './identity.mjs';
import { SEED_GOLD_MILLI, allowSeed, recordSeed } from './guard.mjs';

export { emailHash, normaliseEmail, accountKey };

/** NEAR handed to a fresh account so its own calls can pay gas. */
export const START_NEAR = process.env.TW_START_NEAR || '10';
export const GOLD_TOKEN = '0';
export const LICENCE_TOKEN = '3';
export const DEFAULT_LOAN = process.env.TW_LOAN_TOKEN || '100';

const queues = new Map();

/** One transaction at a time per account: no nonce races. */
function serialise(key, work) {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(work, work);
  queues.set(key, next.catch(() => undefined));
  return next;
}

export function playerAccountId(email) {
  const { accountSuffix, playerAccount, singleCaptain } = chainConfig();
  if (singleCaptain) return playerAccount;
  return `p-${emailHash(email)}.${accountSuffix}`;
}

/** Where this captain's key lives: the seeded captain on the sandbox, one
 *  file per email when `TW_SINGLE_CAPTAIN=0`. */
function playerKeyFile(email) {
  const { playerAccount, singleCaptain } = chainConfig();
  if (singleCaptain) return path.join(paths().keys, `${playerAccount}.json`);
  return path.join(paths().players, `${emailHash(email)}.json`);
}

function playerSigner(email) {
  const file = playerKeyFile(email);
  if (!fs.existsSync(file)) return null;
  const key = readKey(file);
  return signer(file);
}

function ownerSigner() {
  return signer(path.join(paths().keys, `${chainConfig().ownerAccount}.json`));
}

function treasurySigner() {
  return signer(path.join(paths().keys, `${chainConfig().treasuryAccount}.json`));
}

/** House sponsor: the genesis master on sandbox, the deployer on testnet. */
function masterSigner() {
  const file = process.env.TW_MASTER_KEY_FILE || path.join(paths().node, 'validator_key.json');
  return signer(file);
}

/** The house purse: the account that lends gold to a fresh captain.
 *  On the sandbox it is the seeded captain, which holds the world's gold;
 *  on testnet it is the deployer (`TW_SPONSOR_ACCOUNT`). */
function sponsorAccountId() {
  return process.env.TW_SPONSOR_ACCOUNT || chainConfig().playerAccount;
}

function sponsorSigner() {
  return signer(path.join(paths().keys, `${sponsorAccountId()}.json`));
}

/** Below this many NEAR, the house tops the captain up so it never has to
 *  ask the player for gas. */
export const NEAR_FLOOR = Number(process.env.TW_NEAR_FLOOR || 1);

/** The house keeps the captain's account able to pay its own gas. */
export async function topUpNear(accountId, near = '5') {
  const balance = await viewAccountBalance(accountId);
  if (balance >= NEAR_FLOOR) return null;
  const { hash } = await transferNear(masterSigner(), accountId, near);
  return { txHash: hash, near };
}

/** The house puts the first purse in a fresh captain's bag — once.
 *  `guard.mjs` caps it: `SEED_GOLD_MILLI` milli-gold per account, and a
 *  budget of fresh captains per hour. */
export async function seedPurse(email) {
  const { contractId } = chainConfig();
  const address = normaliseEmail(email);
  const accountId = playerAccountId(address);
  if (accountId === sponsorAccountId()) return null;
  const gold = BigInt(await view(contractId, 'mt_balance_of', { account_id: accountId, token_id: GOLD_TOKEN }));
  if (gold > 0n) return null;
  const key = accountKey(address);
  if (!allowSeed(key, SEED_GOLD_MILLI)) {
    throw new Error('E_SPEND_CAP: the house will not fund this captain again');
  }
  const { hash } = await send(sponsorSigner(), contractId, 'mt_transfer', {
    receiver_id: accountId,
    token_id: GOLD_TOKEN,
    amount: String(SEED_GOLD_MILLI),
    approval: null,
    memo: 'sponsor',
  }, { deposit: 1n });
  recordSeed(key, SEED_GOLD_MILLI);
  return { txHash: hash, goldMilli: String(SEED_GOLD_MILLI) };
}

export { ownerSigner, treasurySigner, chainConfig };

/** The `E_…` code a chain error carries (a contract panic, or one of ours),
 *  or '' when the text holds none. */
export function errorCode(error) {
  const text = String(error?.message ?? error);
  const match = text.match(/E_[A-Z_]+/);
  return match === null ? '' : match[0];
}

/** Fine-grained error text from a contract panic, for the UI. */
export function chainError(error) {
  const code = errorCode(error);
  if (code !== '') return code;
  return String(error?.message ?? error).slice(0, 240);
}

export async function position(email) {
  const { contractId } = chainConfig();
  const accountId = playerAccountId(email);
  const exists = await accountExists(accountId);
  const day = await view(contractId, 'get_day');
  if (!exists) {
    return { accountId, contractId, goldMilli: '0', licences: 0, day: Number(day.day), councilOpen: day.council_open };
  }
  const [gold, licences] = await Promise.all([
    view(contractId, 'mt_balance_of', { account_id: accountId, token_id: GOLD_TOKEN }),
    view(contractId, 'mt_balance_of', { account_id: accountId, token_id: LICENCE_TOKEN }),
  ]);
  return {
    accountId,
    contractId,
    goldMilli: String(gold),
    licences: Number(licences),
    day: Number(day.day),
    councilOpen: day.council_open,
  };
}

/** First login: the captain's key, already on this server, or a new account.
 *
 * The house sponsors the newcomer: it creates the account, lends it its first
 * purse (gold) and keeps enough NEAR in it to pay its own gas. The player
 * never sees a wallet, a phrase or a gas prompt — only a hash and a balance.
 *
 * `TW_SINGLE_CAPTAIN=1` (the default) maps every email to the seeded captain,
 * which already holds the world's gold; `TW_SINGLE_CAPTAIN=0` gives every
 * email its own account, `p-<sha256(email)>.<suffix>`.
 */
export async function login(email) {
  const address = normaliseEmail(email);
  const { singleCaptain } = chainConfig();
  const accountId = playerAccountId(address);
  if (!(await accountExists(accountId))) {
    if (singleCaptain) throw new Error(`the seeded captain ${accountId} is missing: run scripts/sandbox/start.mjs`);
    await serialise(accountId, async () => {
      if (await accountExists(accountId)) return;
      const created = await createAccount(masterSigner(), accountId, START_NEAR, undefined);
      // The captain's key lives with the other players' keys, named by the
      // email: one copy, mode 0600, under TW_CHAIN_HOME/players.
      const playerFile = path.join(paths().players, `${emailHash(address)}.json`);
      fs.copyFileSync(created.file, playerFile);
      fs.chmodSync(playerFile, 0o600);
      fs.unlinkSync(created.file);
    });
  }
  if (!fs.existsSync(playerKeyFile(address))) {
    throw new Error(`this server holds no key for ${accountId}`);
  }
  const seed = await seedPurse(address);
  const topUp = await topUpNear(accountId);
  const state = await position(address);
  return {
    ...state,
    seedTxHash: seed === null ? null : seed.txHash,
    seedGoldMilli: seed === null ? null : seed.goldMilli,
    topUpTxHash: topUp === null ? null : topUp.txHash,
  };
}

async function needPlayer(email) {
  const address = normaliseEmail(email);
  if (!(await accountExists(playerAccountId(address)))) throw new Error('unknown captain: log in first');
  const account = playerSigner(address);
  if (account === null) throw new Error('this server holds no key for that captain');
  return { address, account, accountId: playerAccountId(address) };
}

export async function buyLicence(email) {
  const { address, account, accountId } = await needPlayer(email);
  const { contractId } = chainConfig();
  return serialise(accountId, async () => {
    const price = await view(contractId, 'get_licence_price');
    const gold = await view(contractId, 'mt_balance_of', { account_id: accountId, token_id: GOLD_TOKEN });
    if (BigInt(gold) < BigInt(price)) throw new Error(`E_SHORT_GOLD: ${gold} milli-gold for a ${price} milli licence`);
    const receipt = await send(account, contractId, 'buy_licence', {});
    return { txHash: receipt.hash, priceMilli: String(price), licences: (await position(address)).licences };
  });
}

export async function buyLoan(email, tokenId = DEFAULT_LOAN) {
  const { address, account, accountId } = await needPlayer(email);
  const { contractId } = chainConfig();
  return serialise(accountId, async () => {
    const loan = await view(contractId, 'get_loan', { token_id: tokenId });
    const gold = await view(contractId, 'mt_balance_of', { account_id: accountId, token_id: GOLD_TOKEN });
    if (BigInt(gold) < BigInt(loan.owed_milli)) throw new Error(`E_SHORT_GOLD: ${gold} milli-gold for a note of ${loan.owed_milli}`);
    const receipt = await send(account, contractId, 'buy_loan', { token_id: tokenId });
    const after = await view(contractId, 'get_loan', { token_id: tokenId });
    return { txHash: receipt.hash, tokenId, lender: after.lender, owedMilli: String(after.owed_milli), boatDeed: after.boat_deed };
  });
}

/** Motions are few (a season's council tables a handful), so the walk is
 *  short; the bound only guards against a chain that never says "no more". */
const PROPOSAL_SCAN_LIMIT = 256;

/** The last motion the council has **not** resolved — the one a vote must
 *  hit — or `null` when none is open.
 *
 *  The chain numbers motions from 1 (`next_proposal_id` starts at 1) and its
 *  `get_proposal` panics `E_UNKNOWN_PROPOSAL` past the last one: that panic is
 *  how this walk learns it has read them all. One implementation, used by
 *  `vote()` and by anything else that needs to know which motion is on the
 *  table (the tabling route included).
 */
export async function openProposalId(contractId) {
  let open = null;
  for (let id = 1; id <= PROPOSAL_SCAN_LIMIT; id += 1) {
    let proposal;
    try {
      proposal = await view(contractId, 'get_proposal', { proposal_id: id });
    } catch (error) {
      if (errorCode(error) === 'E_UNKNOWN_PROPOSAL') return open;
      throw error;
    }
    if (!proposal.resolved) open = id;
  }
  throw new Error(`E_PROPOSAL_SCAN_LIMIT: no end to ${PROPOSAL_SCAN_LIMIT} motions`);
}

/** Cast the captain's ballot. Without an explicit `proposalId` the vote goes
 *  to the last motion the council has not resolved — the one on the table —
 *  so the browser never has to carry an id and a stale `state.json` cannot
 *  aim the vote at a motion that is already closed. With an explicit id, a
 *  resolved motion is refused up front (`E_RESOLVED`) rather than costing a
 *  failed transaction. */
export async function vote(email, approve = true, proposalId = null) {
  const { address, account, accountId } = await needPlayer(email);
  const { contractId } = chainConfig();
  const explicit = proposalId !== null && proposalId !== undefined;
  const pid = explicit ? Number(proposalId) : await openProposalId(contractId);
  if (pid === null) {
    throw new Error('E_NO_OPEN_PROPOSAL: the council has no motion waiting for a vote');
  }
  if (explicit) {
    const target = await view(contractId, 'get_proposal', { proposal_id: pid });
    if (target.resolved) throw new Error(`E_RESOLVED: motion ${pid} is already resolved`);
  }
  return serialise(accountId, async () => {
    const receipt = await send(account, contractId, 'vote', { proposal_id: pid, approve: Boolean(approve) });
    const proposal = await view(contractId, 'get_proposal', { proposal_id: pid });
    return {
      txHash: receipt.hash,
      proposalId: pid,
      yesWeight: Number(proposal.yes_weight),
      noWeight: Number(proposal.no_weight),
      voters: proposal.voters.length,
      licences: (await position(address)).licences,
    };
  });
}

/** The quota the strip tables when its default button is pressed. */
export const DEFAULT_QUOTA = 60;

/** Table a quota motion. `propose_rule` is `#[payable]` and charges for the
 *  storage it writes: with a zero indemnity (no escrow, no gold moved) the
 *  contract still wants one yoctoNEAR attached, or it panics
 *  `E_STORAGE_DEPOSIT_REQUIRED` — the same call the testnet script makes. */
export async function propose(email, quota = DEFAULT_QUOTA) {
  const { address, account, accountId } = await needPlayer(email);
  const { contractId } = chainConfig();
  const next = Number(quota);
  if (!Number.isInteger(next) || next <= 0) {
    throw new Error(`E_BAD_QUOTA: ${quota} is not a licence quota`);
  }
  return serialise(accountId, async () => {
    const receipt = await send(account, contractId, 'propose_rule', {
      kind: { QuotaPerLicence: next },
      indemnity_milli: '0',
    }, { deposit: 1n });
    const proposalId = Number(getTransactionLastResult(receipt.outcome));
    const proposal = await view(contractId, 'get_proposal', { proposal_id: proposalId });
    return {
      txHash: receipt.hash,
      proposalId,
      quota: next,
      author: proposal.author,
      licences: (await position(address)).licences,
    };
  });
}

/** True while the house is still too poor to trade (see warmup.mjs). */
export async function needsWarmup() {
  const { contractId } = chainConfig();
  const [bank, day, treasury] = await Promise.all([
    // NPC owners are plain strings (`npc:bank`), so the ledger view is the one that answers.
    view(contractId, 'get_ledger', { owner: 'npc:bank', token_id: LICENCE_TOKEN }),
    view(contractId, 'get_day'),
    view(contractId, 'mt_balance_of', { account_id: chainConfig().playerAccount, token_id: GOLD_TOKEN }),
  ]);
  return { bankLicences: Number(bank), day: Number(day.day), treasuryGoldMilli: String(treasury), ready: Number(bank) > 0 && Number(day.day) >= 21 && BigInt(treasury) >= 300_000n };
}
