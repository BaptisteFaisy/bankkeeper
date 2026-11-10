// timeline.ts — transaction steps and hashes of the e2e scenario.
//
// Reads the scenario table from `docs/deployments.md` at build time. When
// the contract has not been deployed yet, the timeline shows the nominal
// steps of `scripts/testnet/e2e.mjs` marked as 'absent' or 'en attente',
// with an honest explanation of what the replay will assert.
import deploymentDoc from '../../../docs/deployments.md?raw';

export type TxStatus = 'confirmed' | 'pending' | 'absent';

export interface TimelineStep {
  id: string;
  order: number;
  action: string;
  hash: string | null;
  status: TxStatus;
  summary: string;
  caller: string;
  standard: string;
}

export const EXPLORER_BASE = 'https://testnet.nearblocks.io/txns';

/** Nominal steps executed by `scripts/testnet/e2e.mjs`. */
export const NOMINAL_STEPS: Omit<TimelineStep, 'order' | 'hash' | 'status'>[] = [
  {
    id: 'step-land',
    action: 'land_lot(deed)',
    summary: 'Débarquement et criée aux étals (moteur wasm / contrat)',
    caller: 'player.bankkeeper.testnet',
    standard: 'Économie portuaire',
  },
  {
    id: 'step-run-day',
    action: 'run_day',
    summary: 'Avancement du calendrier, maintenance et repousse des stocks',
    caller: 'bankkeeper.testnet',
    standard: 'Horloge de saison',
  },
  {
    id: 'step-buy-licence',
    action: 'buy_licence()',
    summary: 'Achat d\u2019une licence de pêche au prix calculé par la criée',
    caller: 'player.bankkeeper.testnet',
    standard: 'NEP-245 (token 3)',
  },
  {
    id: 'step-transfer',
    action: 'mt_transfer(licence)',
    summary: 'Transfert d\u2019une licence au second capitaine avec memo d\u2019accord',
    caller: 'player.bankkeeper.testnet',
    standard: 'NEP-245 core transfer',
  },
  {
    id: 'step-buy-loan',
    action: 'buy_loan(100)',
    summary: 'Achat de la créance de Brandt (devient le prêteur du navire)',
    caller: 'player.bankkeeper.testnet',
    standard: 'NEP-245 (token 100+)',
  },
  {
    id: 'step-forbear',
    action: 'forbear_loan(100)',
    summary: 'Moratoire sur les mensualités en retard (dénouement bienveillant)',
    caller: 'player.bankkeeper.testnet',
    standard: 'Dette et clémence',
  },
  {
    id: 'step-propose',
    action: 'propose_rule(quota)',
    summary: 'Dépôt d\u2019une motion au conseil portuaire (jours 21..27)',
    caller: 'player.bankkeeper.testnet',
    standard: 'Gouvernance on-chain',
  },
  {
    id: 'step-vote-player',
    action: 'vote(proposal, yes)',
    summary: 'Scrutin pondéré : une licence = une voix',
    caller: 'player.bankkeeper.testnet',
    standard: 'Démocratie maritime',
  },
  {
    id: 'step-vote-captain',
    action: 'vote(proposal, yes)',
    summary: 'Vote du second capitaine avec la licence reçue',
    caller: 'captain.bankkeeper.testnet',
    standard: 'Démocratie maritime',
  },
  {
    id: 'step-npc-votes',
    action: 'cast_npc_votes',
    summary: 'Scrutin des capitaines et marchands NPC selon leurs intérêts',
    caller: 'bankkeeper.testnet',
    standard: 'Acteurs autonomes',
  },
  {
    id: 'step-resolve',
    action: 'resolve_council',
    summary: 'Dépouillement, issue et publication du CouncilOutcome',
    caller: 'bankkeeper.testnet',
    standard: 'Résolution de motion',
  },
];

interface ParsedTx {
  action: string;
  hash: string;
}

function parseMarkdownTable(doc: string): ParsedTx[] {
  const match = doc.match(/<!-- e2e:begin -->([\s\S]*?)<!-- e2e:end -->/);
  if (match === null) return [];
  const block = match[1];
  if (block.includes('Aucun rejeu') || block.includes('No scenario')) return [];
  const lines = block.split('\n');
  const out: ParsedTx[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || trimmed.includes('|---') || trimmed.includes('| Transaction |')) {
      continue;
    }
    const cols = trimmed.split('|').map((c) => c.trim()).filter((c) => c !== '');
    if (cols.length >= 2) {
      const action = cols[0];
      const hash = cols[1].replace(/[`\s]/g, '');
      if (hash !== '' && hash !== '—') out.push({ action, hash });
    }
  }
  return out;
}

export function shortHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}\u2026${hash.slice(-6)}`;
}

export function explorerUrl(hash: string): string {
  return `${EXPLORER_BASE}/${encodeURIComponent(hash)}`;
}

/** Build the timeline steps from deployments.md and the contract presence. */
export function loadTimeline(hasContract: boolean): TimelineStep[] {
  const parsed = parseMarkdownTable(deploymentDoc);
  if (parsed.length > 0) {
    return parsed.map((item, idx) => {
      const nominal = NOMINAL_STEPS[idx % NOMINAL_STEPS.length];
      return {
        id: `tx-${idx}-${nominal.id}`,
        order: idx + 1,
        action: item.action,
        hash: item.hash,
        status: 'confirmed',
        summary: nominal.summary,
        caller: nominal.caller,
        standard: nominal.standard,
      };
    });
  }
  const defaultStatus: TxStatus = hasContract ? 'pending' : 'absent';
  return NOMINAL_STEPS.map((item, idx) => ({
    ...item,
    order: idx + 1,
    hash: null,
    status: defaultStatus,
  }));
}
