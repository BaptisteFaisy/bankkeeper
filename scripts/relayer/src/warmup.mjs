// Warm-up: the weeks a fresh chain needs before a captain can trade.
//
// Three facts about the deployed contract drive this file. None is a rule
// change: every step is a public entry point, called by an account we hold.
//
// 1. The constructor gives all 20 licences to the four captains, and the bank
//    (`npc:bank`) only ever refills from `settle_bankruptcies`. A licence can
//    therefore only be sold after one captain goes broke. Gold cannot be moved
//    between accounts (`mt_transfer` is uncallable, see docs/ONCHAIN.md), but
//    `propose_rule` escrows 80 x indemnity  to `npc:escrow`, so a motion by
//    the seeded captain with indemnity = purse/80 leaves it with a few
//    milli-gold, which one day of upkeep takes to exactly zero. The next
//    settlement week calls in its licences; `resolve_council` then refunds the
//    untouched escrow to its author, and `invest_in_actor` reopens the captain.
// 2. The council only sits on season days 21..27, so the ballot needs the
//    clock to reach a window before the UI's "Vote yes" can mean anything.
// 3. A tabled motion is needed for a ballot: the house tables one at zero
//    indemnity, so it escrows nothing.
import path from 'node:path';
import { getTransactionLastResult } from 'near-api-js';
import { paths, readJson, saveState, send, signer, view } from '../../sandbox/lib.mjs';
import { chainConfig, needsWarmup, ownerSigner, treasurySigner, LICENCE_TOKEN, GOLD_TOKEN } from './chain.mjs';

const COUNCIL_FIRST_DAY = 21;
const SETTLEMENT_DAY = 27;
const MAX_RUNS = 90;
const TGAS = 1_000_000_000_000n;
const GAS = 30n * TGAS;
/** One licence vote costs 4 x indemnity; escrow is 20 x 4 x indemnity. */
const ESCROW_PER_MILLI = 80;

function say(line) {
  console.log(line);
}

async function runDay(owner, contractId) {
  const { hash } = await send(owner, contractId, 'run_day', {});
  return hash;
}

async function runTo(owner, contractId, target, label) {
  let day = Number((await view(contractId, 'get_day')).day);
  while (day < target && day < MAX_RUNS) {
    const hash = await runDay(owner, contractId);
    day += 1;
    if (day % 7 === 0 || day === target) {
      const bank = await view(contractId, 'get_ledger', { owner: 'npc:bank', token_id: LICENCE_TOKEN });
      say(`  day ${day} run_day ${hash} → bank licences ${bank}${label ? ` (${label})` : ''}`);
    }
  }
  return day;
}

/** Drain the seeded purse into the council escrow so the captain goes broke. */
async function breakTheCaptain(captain, contractId, accountId) {
  const gold = BigInt(await view(contractId, 'mt_balance_of', { account_id: accountId, token_id: GOLD_TOKEN }));
  const indemnity = gold / BigInt(ESCROW_PER_MILLI);
  assert(Number(indemnity) > 0, `the captain holds ${gold} milli-gold, not enough to escrow`);
  const { hash, outcome } = await send(captain, contractId, 'propose_rule', {
    kind: { QuotaPerLicence: 80 },
    indemnity_milli: String(indemnity),
  }, { gas: GAS });
  const proposalId = Number(getTransactionLastResult(outcome));
  say(`  propose_rule(indemnity ${indemnity}) ${hash} → escrow ${indemnity * BigInt(ESCROW_PER_MILLI)} milli, proposal ${proposalId}`);
  return proposalId;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** The part that runs once: manufacture the licence the bank has to sell. */
async function bootstrap(state, owner, captain) {
  const { contractId } = chainConfig();
  const accountId = state.playerAccount;
  say('• bootstrap: one bankruptcy, so the bank holds licences to sell');
  await runTo(owner, contractId, COUNCIL_FIRST_DAY, 'council opens');
  const proposalId = await breakTheCaptain(captain, contractId, accountId);
  await runTo(owner, contractId, SETTLEMENT_DAY + 1, 'settlement week');
  const bank = Number(await view(contractId, 'get_ledger', { owner: 'npc:bank', token_id: LICENCE_TOKEN }));
  say(`  bank now holds ${bank} licences`);
  const resolved = await send(owner, contractId, 'resolve_council', { proposal_id: proposalId }, { gas: GAS });
  say(`  resolve_council(${proposalId}) ${resolved.hash} → escrow refunded to ${accountId}`);
  await revive(captain, contractId);
  assert(bank > 0, 'no licence reached the bank: buy_licence has nothing to sell');
  return { proposalId, bank };
}

/** `settle_bankruptcies` disarms the captain; its own bailout reopens it. */
async function revive(captain, contractId) {
  try {
    const { hash } = await send(captain, contractId, 'invest_in_actor', {
      actor_id: 'player',
      amount: '1000',
    }, { gas: GAS });
    say(`  invest_in_actor(player, 1000) ${hash} → captain reopened`);
  } catch (error) {
    say(`  invest_in_actor skipped: ${String(error.message).slice(0, 90)}`);
  }
}

/** Leave the chain in a state where "Vote yes" means something. */
async function openBallot(house, contractId, state) {
  const day = await view(contractId, 'get_day');
  const current = Number(day.day);
  if (!day.council_open) {
    const seasonDay = current % 28;
    const target = current + (COUNCIL_FIRST_DAY - seasonDay);
    say(`• council closed on day ${current}: running to day ${target}`);
    await runTo(ownerSigner(), contractId, target, 'council opens');
  }
  if (state.proposalId !== undefined && state.proposalId !== null) {
    const known = await view(contractId, 'get_proposal', { proposal_id: Number(state.proposalId) }).catch(() => null);
    if (known !== null && !known.resolved) return state.proposalId;
  }
  const { hash, outcome } = await send(house, contractId, 'propose_rule', {
    kind: { QuotaPerLicence: 80 },
    indemnity_milli: '0',
  }, { gas: GAS });
  let proposalId = state.proposalId ?? null;
  try {
    proposalId = Number(getTransactionLastResult(outcome));
  } catch {
    // keep the known id: the ballot endpoint refuses cleanly without one
  }
  say(`  propose_rule(quota 80, no indemnity) ${hash} → proposal ${proposalId}`);
  return proposalId;
}

async function main() {
  const { contractId, playerAccount } = chainConfig();
  const owner = ownerSigner();
  const house = treasurySigner();
  const captain = signer(path.join(paths().keys, `${playerAccount}.json`), undefined);
  let state = readJson(paths().state, {});
  const before = await needsWarmup();
  say(`warm-up check: day ${before.day}, bank licences ${before.bankLicences}, captain ${before.treasuryGoldMilli} milli-gold`);
  if (before.bankLicences === 0) state.bootstrap = await bootstrap(state, owner, captain);
  state.proposalId = await openBallot(house, contractId, state);
  const after = await needsWarmup();
  const day = await view(contractId, 'get_day');
  state.day = Number(day.day);
  state.warmup = {
    day: state.day,
    councilOpen: day.council_open,
    bankLicences: (await view(contractId, 'get_ledger', { owner: 'npc:bank', token_id: LICENCE_TOKEN })),
    captainGoldMilli: (await view(contractId, 'mt_balance_of', { account_id: playerAccount, token_id: GOLD_TOKEN })),
    at: new Date().toISOString(),
  };
  saveState(state);
  say(`warm-up done: day ${state.day}, council ${day.council_open ? 'open' : 'closed'}, proposal ${state.proposalId}`);
  say(`  bank licences ${state.warmup.bankLicences} · captain ${state.warmup.captainGoldMilli} milli-gold`);
  if (!state.warmup.councilOpen) say('  note: the council window has closed; the ballot endpoint will refuse until the next window');
}

main().catch((error) => {
  console.error(`warm-up failed: ${error.message}`);
  process.exitCode = 1;
});
