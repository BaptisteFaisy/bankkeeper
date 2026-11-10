// Browser side of the sponsored relayer (VITE_CHAIN=1).
//
// The page never holds a key and never asks for gas: it posts an email and an
// intent to the relayer, which signs and pays. The only things that come back
// are a transaction hash and the new position read from the contract.
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
  yesWeight?: number;
  noWeight?: number;
  voters?: number;
  tokenId?: string;
  lender?: string;
  owedMilli?: string;
  boatDeed?: string;
}

/** Chain mode is opt-in: the wasm demo stays the default build. */
export const CHAIN_ENABLED = import.meta.env.VITE_CHAIN === '1';

/** `?chain=http://host:port` wins over the baked value, so one build fits all. */
export function chainBase(): string {
  const fromQuery = new URLSearchParams(window.location.search).get('chain');
  const base = fromQuery ?? import.meta.env.VITE_CHAIN_URL ?? '/chain';
  return base.replace(/\/$/, '');
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
