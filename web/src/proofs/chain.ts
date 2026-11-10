// Which contract does this page talk to? Answer, in order: the `?contract=`
// query, the id this browser remembers under `tidewater-chain-v1`, then the
// build-time `VITE_TIDEWATER_CONTRACT`. Nothing is hard-coded: with no answer
// the page says "pas encore déployé" instead of pretending.
import { viewFunction } from '../near/rpc';
import type { TokenIconKind } from './icons';

export const RPC_URL = 'https://rpc.testnet.fastnear.com';
export const CHAIN_KEY = 'tidewater-chain-v1';

export interface TokenSpec {
  id: string;
  label: string;
  icon: TokenIconKind;
  unit: string;
  expected: number | null;
  detail: string;
}

// Token categories from contracts/tidewater/src/lib.rs (brief section 6).
export const TOKENS: TokenSpec[] = [
  {
    id: '0',
    label: 'Or',
    icon: 'gold',
    unit: 'milli-or (1 000 = 1 or)',
    expected: null,
    detail: 'Masse monétaire liquide en circulation',
  },
  {
    id: '1',
    label: 'Hareng',
    icon: 'herring',
    unit: 'caisses',
    expected: null,
    detail: 'Poisson pélagique débarqué par les navires',
  },
  {
    id: '2',
    label: 'Cabillaud / Morue',
    icon: 'cod',
    unit: 'caisses',
    expected: null,
    detail: 'Poisson de fond pêché dans The Deeps',
  },
  {
    id: '3',
    label: 'Licences de pêche',
    icon: 'licence',
    unit: 'titres',
    expected: 20,
    detail: 'Offre fixe 20, max 8 par capitaine, 1 licence = 1 voix',
  },
  {
    id: '10',
    label: 'Actes de bateaux',
    icon: 'deed',
    unit: 'titres (10–19)',
    expected: 1,
    detail: 'Un titre par navire du port (10 actes au total)',
  },
  {
    id: '100',
    label: 'Notes de dette',
    icon: 'loan',
    unit: 'titres (100+)',
    expected: 1,
    detail: 'Créance de Brandt gagée sur son navire',
  },
];

export interface SupplyRow extends TokenSpec {
  supply: number | null;
  note: string;
}

interface StoredChain {
  contract?: unknown;
}

/** A JSON value such as `{"contract":"acc.testnet"}`; anything else is junk. */
function parseJsonId(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as StoredChain;
    const id = parsed.contract;
    return typeof id === 'string' && id.trim() !== '' ? id.trim() : null;
  } catch {
    return null;
  }
}

/** A stored value is either the bare account id or a small JSON object. */
function parseStored(raw: string | null): string | null {
  if (raw === null) return null;
  const text = raw.trim();
  if (text === '') return null;
  return text.charCodeAt(0) === 123 ? parseJsonId(text) : text;
}

function remembered(): string | null {
  try {
    return parseStored(window.localStorage.getItem(CHAIN_KEY));
  } catch {
    return null;
  }
}

function fromEnv(): string | null {
  const value = import.meta.env.VITE_TIDEWATER_CONTRACT;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export interface ContractRef {
  id: string;
  source: 'url' | 'localStorage' | 'env';
}

/** The contract id to read, with where it came from (shown on the page). */
export function contractRef(search: string): ContractRef | null {
  const asked = new URLSearchParams(search).get('contract');
  if (asked !== null && asked.trim() !== '') {
    return { id: asked.trim(), source: 'url' };
  }
  const stored = remembered();
  if (stored !== null) return { id: stored, source: 'localStorage' };
  const env = fromEnv();
  return env === null ? null : { id: env, source: 'env' };
}

function toSupply(raw: unknown): { supply: number | null; note: string } {
  if (raw === null || raw === undefined) return { supply: null, note: 'jeton inconnu du contrat' };
  const supply = Number(raw);
  if (!Number.isFinite(supply)) return { supply: null, note: 'réponse illisible' };
  return { supply, note: '' };
}

/** Translate an RPC failure into a sentence a judge can act on. */
function explain(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes('result')) return 'le RPC n\u2019a rendu aucun résultat (compte inexistant ?)';
  if (/fetch|network/i.test(text)) return 'RPC injoignable depuis ce navigateur';
  return text;
}

async function readSupply(contractId: string, token: TokenSpec): Promise<SupplyRow> {
  try {
    const raw = await viewFunction<unknown>({
      rpcUrl: RPC_URL,
      contractId,
      method: 'mt_supply',
      args: { token_id: token.id },
    });
    return { ...token, ...toSupply(raw) };
  } catch (error) {
    return { ...token, supply: null, note: explain(error) };
  }
}

/** `mt_supply` for every token, in parallel; one failure never hides the rest. */
export function readSupplies(contractId: string): Promise<SupplyRow[]> {
  return Promise.all(TOKENS.map((token) => readSupply(contractId, token)));
}

/** True when the RPC answered for at least one token. */
export function answered(rows: SupplyRow[]): boolean {
  return rows.some((row) => row.supply !== null);
}
