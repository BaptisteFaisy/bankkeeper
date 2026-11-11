// `make testnet-deploy` — provisions Tidewater on NEAR testnet, for real.
//
// One faucet call makes the root account (also the contract account, also the
// owner); every other account is a subaccount of it. Re-running is idempotent:
// existing accounts and an existing contract are reused. FORCE_REDEPLOY=1
// redeploys the wasm and re-initialises the state (deploying code wipes state).

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  DOCS,
  FORCE,
  RPC,
  WASM,
  call,
  deployWasm,
  ensureRoot,
  ensureSubaccount,
  ids,
  nearBalance,
  near,
  provider,
  readRecord,
  saveRecord,
  short,
  signer,
  wasmSize,
} from "./testnet-lib.mjs";

const line = (label, value) => console.log(`  ${label.padEnd(20)} ${value}`);
const step = (title) => console.log(`\n\x1b[1m${title}\x1b[0m`);

// The wasm storage eats most of the root's faucet grant, so the scenario
// accounts get change. It is still more than dust: testnet pre-charges
// 100 Tgas against the signer before every call (measured 2026-11-11:
// 0.1009 NEAR required, so the 0.1 NEAR the captain used to get made its
// council ballot fail with `Not enough balance`). Half a NEAR each covers
// every call in the replay with room to spare, and the unused gas comes back.
const SUBACCOUNTS = [
  ["player", ids.player, 0.5],
  ["captain", ids.captain, 0.5],
  ["bank", ids.bank, 0.5],
];

async function main() {
  console.log("\x1b[1mTidewater — NEAR testnet deployment\x1b[0m");
  console.log(`rpc ${RPC}`);
  console.log(`root ${ids.contract}${FORCE ? " · FORCE_REDEPLOY=1" : ""}`);

  step("1. accounts");
  const rootAccount = await ensureRoot(5.6);
  const origin = rootAccount.mode === "faucet" ? "(public faucet)" : `(subaccount of ${rootAccount.parent})`;
  line("contract/owner", `${ids.contract} ${rootAccount.created ? origin : "(reused)"}`);
  if (rootAccount.mode === "subaccount") {
    line("mode", "\x1b[33mfallback\x1b[0m — the faucet is rate-limited, see docs/deployments.md");
  }
  for (const [role, accountId, nearAmount] of SUBACCOUNTS) {
    const { created } = await ensureSubaccount(accountId, ids.contract, nearAmount);
    line(role, `${accountId} ${created ? `(sub, ${nearAmount} NEAR)` : "(reused)"}`);
  }

  step("2. contract");
  const code = fs.readFileSync(WASM);
  const digest = crypto.createHash("sha256").update(code).digest("hex");
  line("wasm", `${path.relative(process.cwd(), WASM)} · ${wasmSize(code.length)}`);
  line("sha256", digest);

  const deployed = await hasCode(ids.contract);
  const initialized = deployed && (await isInitialized());
  const record = readRecord(ids.contract) ?? {};
  let deployHash = record.deployHash ?? null;
  let initHash = record.initHash ?? null;

  if (FORCE || !deployed) {
    deployHash = await deployWasm(signer(ids.contract), WASM);
    line("deploy tx", short(deployHash));
  } else {
    line("deploy", `code already on chain (deploy tx ${deployHash ? short(deployHash) : "inconnu"})`);
  }

  if (FORCE || !initialized) {
    const init = await call(signer(ids.contract), ids.contract, "new", {
      owner: ids.contract,
      player: ids.player,
    });
    if (!init.ok) throw new Error(`init failed: ${init.error ?? JSON.stringify(init.raw).slice(0, 300)}`);
    initHash = init.txHash;
    line("init tx", short(initHash));
    line("init", `owner ${ids.contract} · player ${ids.player}`);
  } else {
    line("init", "state already initialised");
  }

  step("3. on-chain checks");
  const day = await view("get_day");
  const totals = await view("get_gold_totals");
  const zone = await view("get_zone", { zone_id: 1 });
  const owner = await view("get_owner");
  const codeHash = await codeHashOf(ids.contract);
  line("owner()", owner);
  line("day", `${day.day} (week ${day.week}, season_day ${day.season_day}, council ${day.council_open})`);
  line("gold supply", `${totals.total_milli} milli · outside in ${totals.exterior_in_milli} / out ${totals.exterior_out_milli}`);
  line("zone 1", `${zone.name} · stock ${zone.stock}/${zone.capacity} · ${zone.trend}`);
  line("code hash", codeHash);
  if (owner !== ids.contract) throw new Error(`owner is ${owner}, expected ${ids.contract}`);
  if (day.day !== 0) console.log(`  \x1b[33mnote\x1b[0m state is not fresh: day ${day.day} (scenario already replayed)`);

  step("4. balances");
  const balances = [];
  for (const accountId of [ids.contract, ids.player, ids.captain, ids.bank]) {
    const balance = near(await nearBalance(accountId));
    balances.push([accountId, balance]);
    line(accountId, balance);
  }

  step("5. write docs/deployments.md");
  saveRecord(ids.contract, {
    account: ids.contract,
    deployHash,
    initHash,
    digest,
    codeHash,
    size: code.length,
    updatedAt: new Date().toISOString(),
  });
  writeDeployDoc({ digest, codeHash, deployHash, initHash, size: code.length, day, totals, rootAccount, balances });
  line("written", "docs/deployments.md");

  console.log("\n  next: make testnet-e2e   (node scripts/testnet/e2e.mjs)\n");
}

// --------------------------------------------------------------- helpers

async function view(method, args = {}) {
  return provider.callFunction({ contractId: ids.contract, method, args, blockQuery: { finality: "final" } });
}

async function codeHashOf(accountId) {
  const account = await provider.viewAccount({ accountId });
  return account.code_hash ?? account.codeHash ?? "—";
}

const EMPTY_CODE = "11111111111111111111111111111111";

async function hasCode(accountId) {
  if (!(await provider.viewAccount({ accountId }).catch(() => null))) return false;
  const hash = await codeHashOf(accountId);
  return hash !== EMPTY_CODE;
}

async function isInitialized() {
  try {
    await view("get_owner");
    return true;
  } catch {
    return false;
  }
}

function writeDeployDoc(run) {
  const file = path.join(DOCS, "deployments.md");
  const previous = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const doc = [
    docHeader(run),
    docContract({ ...run, ...reusedHashes(previous, run) }),
    docBalances(run.balances),
    "## Transactions du scénario",
    "",
    preserved(previous, "e2e", NO_SCENARIO),
    "",
    preserved(previous, "hand", NO_HAND),
  ].join("\n\n");
  fs.mkdirSync(DOCS, { recursive: true });
  fs.writeFileSync(file, `${doc}\n`);
}

/**
 * Keeps the real deployment and init hashes of the previous run when this run
 * only reused what is already on chain: the hash of the transaction that put
 * the code there does not change because the script was run again.
 */
function reusedHashes(previous, { deployHash, initHash }) {
  const row = (label) =>
    previous.match(new RegExp(`\\| ${label} \\| \`([A-Za-z0-9]{50,})\` \\|`))?.[1] ?? null;
  return {
    deployHash: deployHash ?? row("Hash de déploiement"),
    initHash: initHash ?? row("Hash d'init .*"),
  };
}

/** Keeps a hand-written block across runs; the script never invents one. */
function preserved(previous, name, fallback) {
  return previous.match(new RegExp(`<!-- ${name}:begin -->[\\s\\S]*?<!-- ${name}:end -->`))?.[0] ?? fallback;
}

const NO_SCENARIO =
  "<!-- e2e:begin -->\n_No scenario replay recorded yet: run `make testnet-e2e`._\n<!-- e2e:end -->";

const NO_HAND =
  "<!-- hand:begin -->\n_Rien d'écrit à la main pour l'instant._\n<!-- hand:end -->";

function docHeader({ rootAccount }) {
  const origin =
    rootAccount.mode === "faucet"
      ? "La racine vient du faucet public de testnet (10 NEAR) et tous les autres comptes en sont des sous-comptes : un seul appel au faucet."
      : `\`${ids.contract}\` n'a **pas** été créé par le faucet : \`helper.testnet.near.org\`
a répondu 429 (10 comptes par 3 h et par IP, fenêtre encore fermée), donc il a été
créé comme sous-compte de \`${rootAccount.parent}\`, un compte déjà financé, via
\`TIDEWATER_ROOT_PARENT=${rootAccount.parent}\`. Le contrat, l'état et le scénario
ci-dessous sont identiques au run nominal ; seul le nom du compte change. Une fois
la fenêtre du faucet rouverte, relancer \`node scripts/testnet/deploy.mjs\` sans
\`TIDEWATER_ROOT_PARENT\` donne \`${rootAccount.prefix}.testnet\` ; supprimer ce
compte de repli plus tard rembourse le storage du code à son parent.`;
  return `# Déploiement testnet

Statut : **déployé**. Écrit par \`node scripts/testnet/deploy.mjs\` le
${new Date().toISOString()} — relancer le script est idempotent : un compte
existant et un contrat déjà en place sont réutilisés, et \`FORCE_REDEPLOY=1\`
n'est **pas** un moyen de repartir de zéro (l'état survit au dépôt du code, le
\`new\` qui suit panique — voir \`docs/TESTNET-RUN.md\`). Aucune clé n'est écrite
ici : les credentials vivent dans \`~/.near-credentials/testnet/\`, hors du dépôt.

## Adresses

| Rôle | Compte |
|---|---|
| Contrat, et propriétaire (fait tourner la journée, pilote les bateaux NPC) | \`${ids.contract}\` |
| Joueur | \`${ids.player}\` |
| Second capitaine (reçoit une licence dans le scénario) | \`${ids.captain}\` |
| Banque / signataire de réserve | \`${ids.bank}\` |

Explorateur : <https://testnet.nearblocks.io/address/${ids.contract}>

${origin}`;
}

function docContract({ digest, codeHash, deployHash, initHash, size, day, totals }) {
  return `## Contrat

| Élément | Valeur |
|---|---|
| Wasm | \`target/near/tidewater/tidewater.wasm\`, ${wasmSize(size)} (${size} octets) |
| sha256 | \`${digest}\` |
| Hash de déploiement | \`${deployHash ?? "réutilisé (code déjà on-chain)"}\` |
| Hash d'init (\`new(owner, player)\`) | \`${initHash ?? "réutilisé (état déjà initialisé)"}\` |
| Code hash on-chain | \`${codeHash}\` |

État après ce run : jour ${day.day}, masse d'or ${totals.total_milli} milli,
extérieur entré ${totals.exterior_in_milli} / sorti ${totals.exterior_out_milli}.

Déployé : les licences (\`3\`), les notes de dette (100+), les actes de bateau
(10-19), l'or (0) et les poissons (1, 2) sur le registre NEP-245 — plus le
scrutin du conseil, une voix par licence. Pas on-chain, par construction : les
stocks de zone, la criée et les pilotes NPC (ils tournent dans le moteur
wasm/sim ; la chaîne ne règle que ce que le joueur peut échanger).`;
}

function docBalances(balances) {
  const rows = balances.map(([accountId, amount]) => `| \`${accountId}\` | ${amount} |`);
  return `## Soldes restants

| Compte | Solde |
|---|---|
${rows.join("\n")}

Le storage du code est staké sur le compte contrat (il n'apparaît pas dans son
solde liquide) ; le reste est du NEAR disponible pour les appels.

## Commandes

\`\`\`bash
make testnet-wasm            # cargo near build non-reproducible-wasm
make testnet-deploy          # ou : node scripts/testnet/deploy.mjs
make testnet-e2e             # ou : node scripts/testnet/e2e.mjs
\`\`\``;
}

main().catch((error) => {
  console.error(`\n\x1b[31mdeploy failed:\x1b[0m ${error.message}`);
  process.exit(1);
});
