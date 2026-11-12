// timeline-data.ts — transaction steps and hashes of the e2e scenario.
//
// The hashes come from `docs/deployments.md`, parsed once by `deployment.ts`
// (the same document that gives `chain.ts` the contract id — one source, no
// copy). Each recorded hash is matched to its step by the action name, never
// by position: the replay writes 75 rows and a positional mapping would label
// a `run_day` with the sentence of a `buy_licence`.
//
// When no replay is recorded yet, the timeline shows the nominal steps of
// `scripts/testnet/e2e.mjs` marked as 'absent' or 'en attente'.
import { DEPLOYMENT } from './deployment';

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

/** Who signs: a role, resolved against the deployed address (see `accountOf`). */
type Role = 'player' | 'captain' | 'contract';

interface NominalStep {
  id: string;
  /** The action prefix the replay writes, e.g. `land_lot(10)` → `land_lot`. */
  key: string;
  action: string;
  summary: string;
  caller: Role;
  standard: string;
}

/** Nominal steps executed by `scripts/testnet/e2e.mjs`, in scenario order. */
export const NOMINAL_STEPS: NominalStep[] = [
  {
    id: 'step-assign',
    key: 'assign_boat',
    action: 'assign_boat(deed, zone)',
    summary: 'Affectation des deux navires du joueur à la zone de Greybank',
    caller: 'player',
    standard: 'Actes de bateau (10–19)',
  },
  {
    id: 'step-land',
    key: 'land_lot',
    action: 'land_lot(deed)',
    summary: 'Débarquement et criée aux étals (moteur wasm / contrat)',
    caller: 'player',
    standard: 'Économie portuaire',
  },
  {
    id: 'step-run-day',
    key: 'run_day',
    action: 'run_day',
    summary: 'Avancement du calendrier, maintenance et repousse des stocks',
    caller: 'contract',
    standard: 'Horloge de saison',
  },
  {
    id: 'step-buy-licence',
    key: 'buy_licence',
    action: 'buy_licence()',
    summary: 'Achat d\u2019une licence de pêche au prix calculé par la criée',
    caller: 'player',
    standard: 'NEP-245 (token 3)',
  },
  {
    id: 'step-transfer',
    key: 'mt_transfer',
    action: 'mt_transfer(licence)',
    summary: 'Transfert d\u2019une licence au second capitaine avec memo d\u2019accord',
    caller: 'player',
    standard: 'NEP-245 core transfer',
  },
  {
    id: 'step-buy-loan',
    key: 'buy_loan',
    action: 'buy_loan(100)',
    summary: 'Achat de la créance de Brandt (devient le prêteur du navire)',
    caller: 'player',
    standard: 'NEP-245 (token 100+)',
  },
  {
    id: 'step-forbear',
    key: 'forbear_loan',
    action: 'forbear_loan(100)',
    summary: 'Moratoire sur les mensualités en retard (dénouement bienveillant)',
    caller: 'player',
    standard: 'Dette et clémence',
  },
  {
    id: 'step-propose',
    key: 'propose_rule',
    action: 'propose_rule(quota)',
    summary: 'Dépôt d\u2019une motion au conseil portuaire (jours 21..27)',
    caller: 'player',
    standard: 'Gouvernance on-chain',
  },
  {
    id: 'step-vote-player',
    key: 'vote',
    action: 'vote(proposal, yes)',
    summary: 'Scrutin pondéré : une licence = une voix',
    caller: 'player',
    standard: 'Démocratie maritime',
  },
  {
    id: 'step-vote-captain',
    key: 'vote',
    action: 'vote(proposal, yes)',
    summary: 'Vote du second capitaine avec la licence reçue',
    caller: 'captain',
    standard: 'Démocratie maritime',
  },
  {
    id: 'step-npc-votes',
    key: 'cast_npc_votes',
    action: 'cast_npc_votes',
    summary: 'Scrutin des capitaines et marchands NPC selon leurs intérêts',
    caller: 'contract',
    standard: 'Acteurs autonomes',
  },
  {
    id: 'step-resolve',
    key: 'resolve_council',
    action: 'resolve_council',
    summary: 'Dépouillement, issue et publication du CouncilOutcome',
    caller: 'contract',
    standard: 'Résolution de motion',
  },
];

const ROLE_PREFIX: Record<Role, string> = {
  player: 'player.',
  captain: 'captain.',
  contract: '',
};

/**
 * Resolves a role against the one deployed address read from
 * `docs/deployments.md`. Nothing here hard-codes an account id: while the
 * document records no deployment, the role is named instead of invented.
 */
export function accountOf(role: Role): string {
  const id = DEPLOYMENT.contractId;
  if (id === null) return `${ROLE_PREFIX[role]}<contrat non déployé>`;
  return `${ROLE_PREFIX[role]}${id}`;
}

/** The action prefix the replay writes: `land_lot(10)` → `land_lot`. */
function actionKey(action: string): string {
  return action.split('(')[0].trim();
}

function fallbackStep(action: string): Omit<NominalStep, 'caller'> & { caller: Role } {
  return {
    id: 'step-other',
    key: actionKey(action),
    action,
    summary: 'Étape du rejeu enregistrée par `scripts/testnet/e2e.mjs`.',
    caller: 'player',
    standard: 'Appel de contrat',
  };
}

/**
 * Matches a recorded action to its nominal step. `vote` appears twice in the
 * replay (the player, then the captain), so repeated keys are consumed in
 * order and `seen` tracks how many times each key has already been used.
 */
function nominalFor(action: string, seen: Map<string, number>): NominalStep {
  const key = actionKey(action);
  const matches = NOMINAL_STEPS.filter((step) => step.key === key);
  if (matches.length === 0) return fallbackStep(action);
  const used = seen.get(key) ?? 0;
  seen.set(key, used + 1);
  return matches[Math.min(used, matches.length - 1)];
}

export function shortHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}\u2026${hash.slice(-6)}`;
}

export function explorerUrl(hash: string): string {
  return `${EXPLORER_BASE}/${encodeURIComponent(hash)}`;
}

/** Every hash the replay recorded, each labelled by its own action. */
function confirmedSteps(): TimelineStep[] {
  const seen = new Map<string, number>();
  return DEPLOYMENT.txs.map((tx, idx) => {
    const nominal = nominalFor(tx.action, seen);
    return {
      id: `tx-${idx}-${nominal.id}`,
      order: idx + 1,
      action: tx.action,
      hash: tx.hash,
      status: 'confirmed' as TxStatus,
      summary: nominal.summary,
      caller: accountOf(nominal.caller),
      standard: nominal.standard,
    };
  });
}

/** Build the timeline steps from deployments.md and the contract presence. */
export function loadTimeline(hasContract: boolean): TimelineStep[] {
  if (DEPLOYMENT.txs.length > 0) return confirmedSteps();
  const defaultStatus: TxStatus = hasContract ? 'pending' : 'absent';
  return NOMINAL_STEPS.map((item, idx) => ({
    id: item.id,
    action: item.action,
    summary: item.summary,
    standard: item.standard,
    caller: accountOf(item.caller),
    order: idx + 1,
    hash: null,
    status: defaultStatus,
  }));
}
