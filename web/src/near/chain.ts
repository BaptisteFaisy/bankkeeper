// Browser side of the sponsored relayer.
//
// The page never holds a key and never asks for gas: it posts an email and an
// intent to the relayer, which signs and pays. The only things that come back
// are a transaction hash and the new position read from the contract.
//
// Chain mode is decided at **runtime**, not at build time: the default build
// stays the offline wasm demo, and `?chain` in the URL switches this page to
// the relayer. `?chain=<url>` also says which relayer to talk to, so one
// public build serves both modes (and `VITE_CHAIN_URL` bakes a default).
export interface ChainPosition {
  accountId: string;
  contractId: string;
  goldMilli: string;
  licences: number;
  day: number;
  councilOpen: boolean;
  created?: boolean;
}

export interface ChainReceipt extends ChainPosition {
  txHash?: string;
  priceMilli?: string;
  proposalId?: number;
  quota?: number;
  author?: string;
  yesWeight?: number;
  noWeight?: number;
  voters?: number;
  tokenId?: string;
  lender?: string;
  owedMilli?: string;
  boatDeed?: string;
  /** The house's sponsorship: the first purse, and the gas top-up. */
  seedTxHash?: string | null;
  topUpTxHash?: string | null;
}

/** The query parameter that switches the page to the chain. */
export const CHAIN_PARAM = 'chain';

/** A build with VITE_CHAIN=1 has no offline mode to go back to. */
export function chainBuildOnly(): boolean {
  return import.meta.env.VITE_CHAIN === '1';
}

/** True when the build asked for the chain, or the URL does (`?chain`, with or
 *  without a value). The offline demo stays the default: nothing here fetches. */
export function chainRequested(): boolean {
  if (chainBuildOnly()) return true;
  return new URLSearchParams(window.location.search).has(CHAIN_PARAM);
}

/** `?chain=<url>` names the relayer; a bare host is read as https. */
function queryBase(raw: string | null): string | null {
  if (raw === null) return null;
  const value = raw.trim();
  if (value === '') return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^localhost(:\d+)?$/i.test(value)) return `http://${value}`;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/.*)?$/i.test(value)) return `https://${value}`;
  return null;
}

/** A relayer named in the URL is remembered, so leaving chain mode and coming
 *  back does not lose it. Nothing is written when the URL names none. */
const BASE_KEY = 'tidewater-chain-base-v1';

function remember(base: string | null): void {
  if (base === null) return;
  try {
    sessionStorage.setItem(BASE_KEY, base);
  } catch {
    // Storage blocked: the URL stays the only memory of the relayer.
  }
}

function remembered(): string | null {
  try {
    return sessionStorage.getItem(BASE_KEY);
  } catch {
    return null;
  }
}

function fromUrl(): string | null {
  return queryBase(new URLSearchParams(window.location.search).get(CHAIN_PARAM));
}

remember(fromUrl());

/** The relayer base: the query wins, then what this browser was told, then the
 *  baked value, then the dev proxy. */
export function chainBase(): string {
  const base = fromUrl() ?? remembered() ?? import.meta.env.VITE_CHAIN_URL ?? '/chain';
  return base.replace(/\/$/, '');
}

/** The page URL that asks for the chain (`on`), or leaves it. A reload follows:
 *  the mode is a page property, and the harbour save is untouched either way.
 *  The relayer stays readable in the address bar (`:` and `/` are legal in a
 *  query), so a judge can copy the link and see which relayer it names. */
export function chainUrl(on: boolean): string {
  const url = new URL(window.location.href);
  const rest = [...url.searchParams.entries()]
    .filter(([key]) => key !== CHAIN_PARAM)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const chain = on ? `${CHAIN_PARAM}=${fromUrl() ?? remembered() ?? '1'}` : '';
  const query = [chain, rest].filter((part) => part !== '').join('&');
  url.search = query === '' ? '' : `?${query}`;
  return url.toString();
}

/** 8 + 4 characters: the hash stays readable, the link carries all of it. */
export function shortHash(hash: string | null): string {
  if (hash === null) return '—';
  return hash.length > 12 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash;
}

/** The testnet explorer link for a hash the relayer returned. */
export function explorerUrl(hash: string): string {
  return `https://testnet.near.org/tx/${hash}`;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${chainBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as { error?: string } & Partial<T>;
  if (!res.ok) throw new Error(payload.error ?? `relayer HTTP ${res.status}`);
  return payload as T;
}

export function chainLogin(email: string): Promise<ChainReceipt> {
  return post<ChainReceipt>('/login', { email });
}

export function chainBuyLicence(email: string): Promise<ChainReceipt> {
  return post<ChainReceipt>('/licence/buy', { email });
}

export function chainBuyLoan(email: string, tokenId?: string): Promise<ChainReceipt> {
  return post<ChainReceipt>('/loan/buy', { email, tokenId });
}

export function chainVote(email: string, approve: boolean): Promise<ChainReceipt> {
  return post<ChainReceipt>('/council/vote', { email, approve });
}

/** The quota the strip tables when its default button is pressed: the one the
 *  relayer also defaults to, so an old browser and an old relayer agree. */
export const DEFAULT_QUOTA = 60;

/** Table a quota motion. The relayer attaches the anti-spam yoctoNEAR the
 *  contract asks for; the motion carries no indemnity, so it costs no gold. */
export function chainPropose(email: string, quota: number = DEFAULT_QUOTA): Promise<ChainReceipt> {
  return post<ChainReceipt>('/council/propose', { email, quota });
}

/** One sentence per relayer refusal, so the player is never left guessing. */
export function chainErrorMessage(problem: unknown): string {
  const text = problem instanceof Error ? problem.message : String(problem);
  if (text === 'E_RATE_LIMIT') return 'The relayer is rate-limiting right now. Wait a moment and try again.';
  if (text === 'E_ACTION_CAP') return 'This account has used its sponsored transactions for the hour. Try again later.';
  if (text.startsWith('E_SHORT_GOLD')) return 'The NEAR account does not hold enough gold for that purchase.';
  if (text.startsWith('E_NO_OPEN_PROPOSAL')) return 'The council has no motion on the table: propose one first.';
  if (text.startsWith('E_COUNCIL_CLOSED')) return 'The council only sits on season days 21 to 27.';
  if (text.startsWith('relayer HTTP ')) return `The relayer answered ${text.slice('relayer HTTP '.length)}. It may be restarting.`;
  if (text.includes('Failed to fetch') || text.includes('NetworkError')) return 'The relayer is unreachable from this browser.';
  return text;
}
