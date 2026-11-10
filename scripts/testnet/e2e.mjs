// `make testnet-e2e` — replays the Tidewater scenario against the contract that
// actually sits on NEAR testnet, and prints every transaction hash.
//
// The scenario is deliberately the on-chain half of the brief only: licences,
// debt notes and the council ballot move as NEP-245 tokens, while zone stocks,
// the auction and the NPC pilots stay in the engine. Every step asserts what it
// read afterwards and the script exits 1 on the first broken assertion.
//
// A note on the calendar: the council opens on season days 21..27 (day % 28),
// so the replay first plays 21 days of landings — the player earns the gold a
// licence, a loan note and a ballot actually cost — before proposing a rule.

import fs from "node:fs";
import path from "node:path";
import { DOCS, call, gold, ids, near, nearBalance, short, signer, view } from "./testnet-lib.mjs";

const C = ids.contract;
const PLAYER = ids.player;
const CAPTAIN = ids.captain;
const LICENCE = "3";
const LOAN = "100";
const BOATS = ["10", "11"];
const COUNCIL_DAY = 21;
const NEXT_QUOTA = 80;

const player = signer(PLAYER);
const captain = signer(CAPTAIN);
const owner = signer(C);

const log = [];
const hashes = [];

function say(text) {
  console.log(text);
  log.push(text.replace(/\x1b\[[0-9;]*m/g, ""));
}

/** One printed step: action, caller, transaction hash, then what was read. */
function step(action, caller, result, readBack) {
  const hash = short(result?.txHash);
  if (result?.txHash) hashes.push(`${action} · ${short(result.txHash)}`);
  say(`  ${action.padEnd(26)} ${caller.padEnd(34)} ${hash.padEnd(16)} → ${readBack}`);
}

/** U128 arrives as a string, u64 as a number, a struct as an object: one reader. */
function num(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "object") return Number(value[0] ?? value["0"] ?? 0);
  return Number(value);
}

function check(label, condition, detail) {
  if (!condition) throw new Error(`assertion failed: ${label}${detail ? ` (${detail})` : ""}`);
}

async function must(action, caller, account, method, args = {}, options = {}) {
  const result = await call(account, C, method, args, options);
  if (!result.ok) throw new Error(`${action} failed from ${caller}: ${result.error ?? JSON.stringify(result.raw).slice(0, 300)}`);
  return result;
}

// ------------------------------------------------------------------ scenarios

async function playDays(until, players) {
  let day = Number((await view(C, "get_day")).day);
  while (day < until) {
    const before = await view(C, "get_day");
    const goldBefore = num(await view(C, "get_ledger", { owner: PLAYER, token_id: "0" }));
    let landed = 0;
    for (const deed of BOATS) {
      const quota = num(await view(C, "get_quota_left", { captain: "player" }));
      if (quota < 10) break;
      const receipt = await must(`land_lot(${deed})`, PLAYER, players, "land_lot", { deed });
      landed += 1;
      say(
        `  day ${String(day).padStart(2)} land_lot(${deed})`.padEnd(28) +
          ` ${PLAYER.padEnd(34)} ${short(receipt.txHash).padEnd(16)} → ` +
          `${receipt.value.crates} crates ${receipt.value.species} at ${gold(receipt.value.price_milli)} = ${gold(receipt.value.total_milli)}`,
      );
    }
    const outcome = await must("run_day", C, owner, "run_day", {});
    const after = await view(C, "get_day");
    const goldAfter = num(await view(C, "get_ledger", { owner: PLAYER, token_id: "0" }));
    say(
      `  day ${String(day).padStart(2)} run_day`.padEnd(28) +
        ` ${C.padEnd(34)} ${short(outcome.txHash).padEnd(16)} → ` +
        `day ${after.day}, regrowth [${outcome.value.regrowth.join(", ")}], upkeep ${gold(outcome.value.upkeep_milli)}, ` +
        `player ${gold(goldBefore)} → ${gold(goldAfter)}`,
    );
    check("run_day advances exactly one day", num(after.day) === num(before.day) + 1, `${before.day} -> ${after.day}`);
    check("landings pay the player", landed === 0 || goldAfter >= goldBefore, `${goldBefore} -> ${goldAfter}`);
    day = Number(after.day);
  }
  return day;
}

async function licenceMoves() {
  const price = await view(C, "get_licence_price");
  const bankHeld = num(await view(C, "get_ledger", { owner: "npc:bank", token_id: LICENCE }));
  check("the bank holds a licence to sell", bankHeld > 0, `bank licences ${bankHeld} — the contract only refills them from bankruptcies, so this scenario needs a fresh deployment`);
  const before = num(await view(C, "mt_balance_of", { account_id: PLAYER, token_id: LICENCE }));
  const receipt = await must("buy_licence()", PLAYER, player, "buy_licence", {});
  const after = num(await view(C, "mt_balance_of", { account_id: PLAYER, token_id: LICENCE }));
  say(`  buy_licence()`.padEnd(28) + ` ${PLAYER.padEnd(34)} ${short(receipt.txHash).padEnd(16)} → ${receipt.value.reasoning}`);
  check("buy_licence mints one licence to the caller", after === before + 1, `mt_balance_of ${before} -> ${after}`);
  check("the quoted price was charged", num(receipt.value.price_milli) === num(price), `${receipt.value.price_milli} vs ${price}`);

  const captainBefore = num(await view(C, "mt_balance_of", { account_id: CAPTAIN, token_id: LICENCE }));
  const transfer = await must("mt_transfer(licence)", PLAYER, player, "mt_transfer", {
    receiver_id: CAPTAIN,
    token_id: LICENCE,
    amount: "1",
    approval: null,
    memo: "one licence, one vote",
  }, { deposit: 1n });
  const playerAfter = num(await view(C, "mt_balance_of", { account_id: PLAYER, token_id: LICENCE }));
  const captainAfter = num(await view(C, "mt_balance_of", { account_id: CAPTAIN, token_id: LICENCE }));
  const event = transfer.logs.find((line) => line.includes('"event":"mt_transfer"')) ?? "no event";
  say(`  mt_transfer(3, 1)`.padEnd(28) + ` ${PLAYER.padEnd(34)} ${short(transfer.txHash).padEnd(16)} → ${PLAYER} ${playerAfter}, ${CAPTAIN} ${captainAfter}`);
  say(`    event: ${event.slice(0, 150)}`);
  check("a licence left the player", playerAfter === after - 1, `${after} -> ${playerAfter}`);
  check("a licence reached the captain", captainAfter === captainBefore + 1, `${captainBefore} -> ${captainAfter}`);
  check("the transfer emitted a NEP-245 event", transfer.logs.some((line) => line.includes('"standard":"nep245"')));
  check("supply is conserved", num(await view(C, "mt_supply", { token_id: LICENCE })) === 20, "mt_supply(3)");
  return playerAfter + captainAfter;
}

async function debtNote() {
  const before = num(await view(C, "mt_balance_of", { account_id: PLAYER, token_id: LOAN }));
  const bank = await view(C, "get_loan", { token_id: LOAN });
  const bought = await must("buy_loan(100)", PLAYER, player, "buy_loan", { token_id: LOAN });
  const note = await view(C, "get_loan", { token_id: LOAN });
  const held = num(await view(C, "mt_balance_of", { account_id: PLAYER, token_id: LOAN }));
  say(`  buy_loan(100)`.padEnd(28) + ` ${PLAYER.padEnd(34)} ${short(bought.txHash).padEnd(16)} → lender ${note.lender}, owed ${gold(note.owed_milli)}, boat deed ${note.boat_deed}`);
  check("the bank was the lender", bank.lender === "npc:bank", bank.lender);
  check("the note token moved to the player", held === before + 1, `${before} -> ${held}`);
  check("get_loan shows the player as lender", note.lender === PLAYER, String(note.lender));
  check("the note keeps its collateral", note.boat_deed === bank.boat_deed, `${note.boat_deed} vs ${bank.boat_deed}`);

  const forbear = await must("forbear_loan(100)", PLAYER, player, "forbear_loan", { token_id: LOAN });
  const forgiven = await view(C, "get_loan", { token_id: LOAN });
  say(`  forbear_loan(100)`.padEnd(28) + ` ${PLAYER.padEnd(34)} ${short(forbear.txHash).padEnd(16)} → missed ${forgiven.missed}, owed ${gold(forgiven.owed_milli)}`);
  check("forbearance clears missed payments", num(forgiven.missed) === 0, String(forgiven.missed));
}

async function council() {
  const day = await view(C, "get_day");
  check("the council is open (season days 21..27)", day.council_open === true, `day ${day.day}, season_day ${day.season_day}`);

  const proposed = await must(`propose_rule(quota ${NEXT_QUOTA})`, PLAYER, player, "propose_rule", {
    kind: { QuotaPerLicence: NEXT_QUOTA },
    indemnity_milli: "0",
  });
  const proposalId = num(proposed.value);
  const open = await view(C, "get_proposal", { proposal_id: proposalId });
  say(`  propose_rule(${NEXT_QUOTA})`.padEnd(28) + ` ${PLAYER.padEnd(34)} ${short(proposed.txHash).padEnd(16)} → proposal ${proposalId}, author ${open.author}, escrow ${gold(open.escrow_milli)}`);

  const playerVote = await must(`vote(${proposalId})`, PLAYER, player, "vote", { proposal_id: proposalId, approve: true });
  const captainVote = await must(`vote(${proposalId})`, CAPTAIN, captain, "vote", { proposal_id: proposalId, approve: true });
  const afterVotes = await view(C, "get_proposal", { proposal_id: proposalId });
  say(`  vote(${proposalId}, yes) x2`.padEnd(28) + ` ${`${PLAYER} + ${CAPTAIN}`.padEnd(34)} ${short(captainVote.txHash).padEnd(16)} → yes ${afterVotes.yes_weight}, no ${afterVotes.no_weight}, voters [${afterVotes.voters.join(", ")}]`);
  say(`    player vote tx ${short(playerVote.txHash)} · weighted by licences, one licence one vote`);
  check("both votes are recorded", afterVotes.voters.length === 2, afterVotes.voters.join(", "));

  const npc = await must("cast_npc_votes", C, owner, "cast_npc_votes", { proposal_id: proposalId });
  const withNpc = await view(C, "get_proposal", { proposal_id: proposalId });
  say(`  cast_npc_votes(${proposalId})`.padEnd(28) + ` ${C.padEnd(34)} ${short(npc.txHash).padEnd(16)} → yes ${withNpc.yes_weight}, no ${withNpc.no_weight}, voters ${withNpc.voters.length}`);

  const resolved = await must("resolve_council", C, owner, "resolve_council", { proposal_id: proposalId });
  const outcome = resolved.value;
  const after = await view(C, "get_day");
  say(`  resolve_council(${proposalId})`.padEnd(28) + ` ${C.padEnd(34)} ${short(resolved.txHash).padEnd(16)} → CouncilOutcome ${JSON.stringify(outcome)}`);
  say(`    quota_per_licence ${day.quota_per_licence} → ${after.quota_per_licence} (get_day), council still open ${after.council_open}`);

  check("the proposal resolved", outcome.proposal_id === proposalId, String(outcome.proposal_id));
  check("the tally favours yes", outcome.yes_weight > outcome.no_weight, `${outcome.yes_weight} vs ${outcome.no_weight}`);
  check("the rule passed", outcome.passed === true);
  check("the rule is live on chain", num(after.quota_per_licence) === NEXT_QUOTA, `${after.quota_per_licence}`);
  check("the resolution is stored", (await view(C, "get_proposal", { proposal_id: proposalId })).resolved === true);
}

// ----------------------------------------------------------------------- main

async function main() {
  console.log("\x1b[1mTidewater — on-chain scenario on NEAR testnet\x1b[0m");
  console.log(`contract ${C}`);
  console.log(`owner    ${C} (runs the day, pilots NPC boats)`);
  console.log(`player   ${PLAYER}`);
  console.log(`captain  ${CAPTAIN}\n`);

  // 1. views first: they cost nothing and prove the contract answers.
  const day0 = await view(C, "get_day");
  const totals = await view(C, "get_gold_totals");
  const zone = await view(C, "get_zone", { zone_id: 1 });
  const price = await view(C, "get_licence_price");
  say(`  get_day()`.padEnd(28) + ` view                               —                → day ${day0.day}, week ${day0.week}, season_day ${day0.season_day}, council ${day0.council_open}`);
  say(`  get_gold_totals()`.padEnd(28) + ` view                               —                → ${totals.total_milli} milli in the harbour, outside in ${totals.exterior_in_milli} / out ${totals.exterior_out_milli}`);
  say(`  get_zone(1)`.padEnd(28) + ` view                               —                → ${zone.name}, stock ${zone.stock}/${zone.capacity}, ${zone.trend}, ${zone.catch_per_trip} crates a trip`);
  say(`  get_licence_price()`.padEnd(28) + ` view                               —                → ${gold(price)}`);
  check("the contract answers views", day0.day !== undefined && totals.total_milli > 0);
  check("the ledger starts with gold", num(totals.total_milli) > 0, String(totals.total_milli));
  check("the player got the seeded boats", (await view(C, "get_boat", { deed: "10" })).captain === "player");

  // 2. two clicks: put both boats on Greybank.
  for (const deed of BOATS) {
    const assigned = await must(`assign_boat(${deed})`, PLAYER, player, "assign_boat", { deed, zone: 1, small_mesh: false });
    const boat = await view(C, "get_boat", { deed });
    say(`  assign_boat(${deed}, 1)`.padEnd(28) + ` ${PLAYER.padEnd(34)} ${short(assigned.txHash).padEnd(16)} → zone ${boat.zone}, small mesh ${boat.small_mesh}`);
    check(`boat ${deed} is on Greybank`, num(boat.zone) === 1, String(boat.zone));
  }

  // 3. play up to the council week, earning the gold the trades below cost.
  const day = await playDays(COUNCIL_DAY, player);
  say(`  — reached day ${day} (council week)`);
  const wallet = num(await view(C, "get_ledger", { owner: PLAYER, token_id: "0" }));
  say(`  player gold after ${day} days: ${gold(wallet)}`);

  // 4. licences: buy one, then move it with NEP-245.
  const licencesHeld = await licenceMoves();

  // 5. debt note: buy the bank's Brandt note, then grant a delay.
  await debtNote();

  // 6. the council: propose, vote, NPCs vote, tally.
  await council();

  // 7. the day cycle still runs after the vote.
  const before = await view(C, "get_day");
  const ran = await must("run_day", C, owner, "run_day", {});
  const after = await view(C, "get_day");
  say(`  run_day()`.padEnd(28) + ` ${C.padEnd(34)} ${short(ran.txHash).padEnd(16)} → day ${before.day} → ${after.day}, council ${after.council_open}, quota ${after.quota_per_licence}`);
  check("run_day advances the day", num(after.day) === num(before.day) + 1, `${before.day} -> ${after.day}`);

  const left = await nearBalance(PLAYER);
  say(`  player gas balance: ${near(left)} · licences held by the player and the captain: ${licencesHeld}`);
  say(`\n\x1b[32mall steps passed\x1b[0m — ${hashes.length} transactions, ${new Set(hashes.map((h) => h.split("· ")[1])).size} distinct hashes`);
}

main()
  .then(() => writeTranscript(null))
  .catch((error) => {
    console.error(`\n\x1b[31mscenario failed:\x1b[0m ${error.message}`);
    log.push(`FAILED: ${error.message}`);
    writeTranscript(error);
    process.exitCode = 1;
  });

function writeScenarioSection(error) {
  const file = path.join(DOCS, "deployments.md");
  if (error || !fs.existsSync(file)) return;
  const doc = fs.readFileSync(file, "utf8");
  const block = [
    "<!-- e2e:begin -->",
    `Replayed by \`node scripts/testnet/e2e.mjs\` on ${new Date().toISOString()}.`,
    "",
    "| Transaction | Hash |",
    "|---|---|",
    ...hashes.map((entry) => {
      const [action, hash] = entry.split(" · ");
      return `| ${action} | \`${hash}\` |`;
    }),
    "",
    "Full transcript with every value read back: `docs/e2e-testnet.log`.",
    "<!-- e2e:end -->",
  ].join("\n");
  const next = /<!-- e2e:begin -->[\s\S]*?<!-- e2e:end -->/.test(doc)
    ? doc.replace(/<!-- e2e:begin -->[\s\S]*?<!-- e2e:end -->/, block)
    : `${doc}\n## Scenario transactions\n\n${block}\n`;
  fs.writeFileSync(file, next);
}

function writeTranscript(error) {
  const file = path.join(DOCS, "e2e-testnet.log");
  const header = [
    "# Tidewater — testnet scenario transcript",
    `# ${new Date().toISOString()}`,
    `# contract ${C}`,
    "",
  ];
  fs.mkdirSync(DOCS, { recursive: true });
  fs.writeFileSync(file, [...header, ...log, "", error ? `FAILED: ${error.message}` : "all steps passed"].join("\n"));
  console.log(`  transcript: ${path.relative(process.cwd(), file)}`);
  if (!error) {
    writeScenarioSection(null);
    console.log(`  hashes: ${hashes.length} transactions written to docs/deployments.md`);
  }
}
