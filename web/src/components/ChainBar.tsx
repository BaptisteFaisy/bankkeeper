// The on-chain strip: one status line and the three sponsored actions.
// Only mounted when VITE_CHAIN=1; the wasm demo never renders it.
import { useCallback, useEffect, useState } from 'react';
import { chainBuyLicence, chainBuyLoan, chainLogin, chainVote } from '../near/chain';
import type { ChainPosition, ChainReceipt } from '../near/chain';
import { fmtGold } from '../format';

type Busy = 'login' | 'licence' | 'loan' | 'vote' | null;

function shortHash(hash: string | null): string {
  if (hash === null) return '—';
  return hash.length > 12 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash;
}

export default function ChainBar({ email }: { email: string }) {
  const [position, setPosition] = useState<ChainPosition | null>(null);
  const [busy, setBusy] = useState<Busy>('login');
  const [tx, setTx] = useState<string | null>(null);
  const [note, setNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (kind: Exclude<Busy, null>, work: () => Promise<ChainReceipt>, done: (receipt: ChainReceipt) => string) => {
    setBusy(kind);
    setError(null);
    try {
      const receipt = await work();
      setPosition(receipt);
      setTx(receipt.txHash ?? null);
      setNote(done(receipt));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setBusy('login');
    chainLogin(email)
      .then((receipt) => {
        if (cancelled) return;
        setPosition(receipt);
        setNote(`relayer signs for ${receipt.accountId}`);
      })
      .catch((problem: unknown) => {
        if (!cancelled) setError(problem instanceof Error ? problem.message : String(problem));
      })
      .finally(() => {
        if (!cancelled) setBusy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [email]);

  const gold = position === null ? '—' : `${fmtGold(Number(position.goldMilli) / 1000)}g`;
  const status = position === null
    ? (busy === 'login' ? 'signing in with the relayer…' : 'no chain account yet')
    : `${position.contractId} · ${position.accountId} · ${position.licences} licences · ${gold}`;

  return (
    <div className="chain-bar" aria-label="On-chain">
      <span className="chain-dot" aria-hidden="true" />
      <span className="muted" data-testid="chain-status">NEAR · <span data-testid="chain-account">{status}</span></span>
      <span className="chain-tx" data-testid="chain-tx">{tx === null ? (note || 'no transaction yet') : `tx ${shortHash(tx)}`}</span>
      <button type="button" data-testid="chain-licence" disabled={busy !== null}
        onClick={() => { void run('licence', () => chainBuyLicence(email), (r) => `licence bought (${r.licences} held)`); }}>
        {busy === 'licence' ? 'Buying…' : 'Buy a licence'}
      </button>
      <button type="button" data-testid="chain-loan" disabled={busy !== null}
        onClick={() => { void run('loan', () => chainBuyLoan(email), (r) => `debt note ${r.tokenId} bought`); }}>
        {busy === 'loan' ? 'Buying…' : 'Buy a debt note'}
      </button>
      <button type="button" data-testid="chain-vote" disabled={busy !== null}
        onClick={() => { void run('vote', () => chainVote(email, true), (r) => `vote ${r.proposalId} yes (${r.yesWeight} against ${r.noWeight})`); }}>
        {busy === 'vote' ? 'Voting…' : 'Vote yes'}
      </button>
      {error === null ? null : <span className="chain-error" data-testid="chain-error">{error}</span>}
    </div>
  );
}
