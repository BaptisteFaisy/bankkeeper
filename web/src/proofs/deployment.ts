// deployment.ts — the single reader of `docs/deployments.md`.
//
// `scripts/testnet/deploy.mjs` writes that file, and it is the only place in
// the repository where the deployed contract id lives. The proofs page reads
// the id and the scenario hashes from here, at build time, so the address is
// never duplicated: one document, one parser, two consumers (`chain.ts` for
// the id, `timeline.ts` for the transaction table).
//
// When the document still says "not deployed", `contractId` is null and the
// page says so instead of inventing an address.
import deploymentDoc from '../../../docs/deployments.md?raw';

export interface DeployedTx {
  action: string;
  hash: string;
}

export interface Deployment {
  /** The contract account, or null while the document records no deployment. */
  contractId: string | null;
  /** Every transaction hash the replay recorded, in execution order. */
  txs: DeployedTx[];
  /** The ISO timestamp the replay wrote, when it wrote one. */
  replayedAt: string | null;
}

/** Words the generated document uses while nothing is on chain yet. */
const NOT_DEPLOYED = [
  'pas encore déployé',
  'not deployed yet',
  'no scenario replay recorded',
  'aucun rejeu',
];

/** Reads the contract account out of the "Adresses" table's first row. */
function parseContractId(doc: string): string | null {
  if (NOT_DEPLOYED.some((mark) => doc.toLowerCase().includes(mark))) return null;
  const body = sectionOf(doc, 'Adresses');
  for (const line of body.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    // A table row: ['', role, '`account`', ''] — the contract row is the one
    // naming the owner, and it is always the first account of the table.
    const account = cells.find((cell) => /^`[^`]+\.testnet`$/.test(cell));
    if (account !== undefined) return account.slice(1, -1);
  }
  return null;
}

/** The body of a `## <title>` section, up to the next `## ` (or the end). */
function sectionOf(doc: string, title: string): string {
  const sections = doc.split(/^## /m);
  const wanted = sections.find((section) => section.startsWith(title));
  return wanted === undefined ? doc : wanted;
}

/** Reads the scenario table between the `e2e` markers. */
export function parseTxs(doc: string): DeployedTx[] {
  const block = doc.match(/<!-- e2e:begin -->([\s\S]*?)<!-- e2e:end -->/)?.[1];
  if (block === undefined) return [];
  if (NOT_DEPLOYED.some((mark) => block.toLowerCase().includes(mark.toLowerCase()))) return [];
  const out: DeployedTx[] = [];
  for (const line of block.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || trimmed.includes('|---') || trimmed.includes('| Transaction |')) {
      continue;
    }
    const cols = trimmed.split('|').map((cell) => cell.trim()).filter((cell) => cell !== '');
    if (cols.length < 2) continue;
    const hash = cols[1].replace(/[`\s]/g, '');
    if (hash !== '' && hash !== '—') out.push({ action: cols[0], hash });
  }
  return out;
}

function parseReplayedAt(doc: string): string | null {
  return doc.match(/e2e\.mjs`?\s*(?:on|le)\s+([0-9T:.Z+-]+)/)?.[1] ?? null;
}

/** The deployment as the document records it, parsed once at build time. */
export function readDeployment(doc: string = deploymentDoc): Deployment {
  return {
    contractId: parseContractId(doc),
    txs: parseTxs(doc),
    replayedAt: parseReplayedAt(doc),
  };
}

/** The deployed contract id, or null. Imported by `chain.ts` only. */
export const DEPLOYMENT: Deployment = readDeployment();
