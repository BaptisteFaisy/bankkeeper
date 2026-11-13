// The on-chain strip: the NEAR account, the last transaction and the four
// sponsored actions. Mounted only in chain mode — the offline demo never
// renders it and never calls the relayer.
//
// Every call goes through the shared chain session (near/chainProvider), which
// holds the double-click guard, so the buttons here only show the state.
import { chainUrl, explorerUrl, shortHash } from '../near/chain';
import { useChain } from '../near/chainProvider';
import type { ChainValue } from '../near/chainProvider';
import { fmtGold } from '../format';

function statusLine(chain: ChainValue): string {
  const position = chain.position;
  if (position === null) {
    return chain.busy === 'login' ? 'opening your NEAR account…' : 'no NEAR account yet';
  }
  const gold = `${fmtGold(Number(position.goldMilli) / 1000)}g`;
  return `${position.contractId} · ${position.accountId} · ${position.licences} licences · ${gold}`;
}

/** The last result said in full, then the hash the explorer link carries. */
function ChainTx({ chain }: { chain: ChainValue }) {
  const hash = chain.txHash;
  return (
    <>
      <span className="chain-note" data-testid="chain-note" role="status" aria-live="polite">
        {chain.note}
      </span>
      <span className="chain-tx" data-testid="chain-tx">
        {hash === null ? 'no transaction yet' : (
          <>
            {`tx ${shortHash(hash)} `}
            <a className="chain-link" data-testid="chain-explorer" href={explorerUrl(hash)}
              target="_blank" rel="noreferrer">explorer</a>
          </>
        )}
      </span>
    </>
  );
}

/** The four sponsored actions: one in flight at a time, the rest disabled —
 *  and none of them before the relayer has opened the account. */
function ChainActions({ chain }: { chain: ChainValue }) {
  const ready = chain.busy === null && chain.position !== null;
  const label = (kind: string, rest: string, running: string): string => (chain.busy === kind ? running : rest);
  return (
    <>
      <button type="button" data-testid="chain-licence" disabled={!ready}
        onClick={() => { void chain.buyLicence(); }}>
        {label('licence', 'Buy a licence', 'Buying…')}
      </button>
      <button type="button" data-testid="chain-loan" disabled={!ready}
        onClick={() => { void chain.buyLoan(); }}>
        {label('loan', 'Buy a debt note', 'Buying…')}
      </button>
      <button type="button" data-testid="chain-vote" disabled={!ready}
        onClick={() => { void chain.vote(); }}>
        {label('vote', 'Vote yes', 'Voting…')}
      </button>
      <button type="button" data-testid="chain-propose" disabled={!ready}
        onClick={() => { void chain.propose(); }}>
        {label('propose', 'Propose quota', 'Proposing…')}
      </button>
    </>
  );
}

/** The way back to the offline harbour — always — and, on a refusal, what
 *  happened plus one retry. Never a dead end. */
function ChainSide({ chain }: { chain: ChainValue }) {
  return (
    <>
      {chain.error === null ? null : (
        <>
          <span className="chain-error" role="alert" data-testid="chain-error">{chain.error}</span>
          <button type="button" className="ghost" data-testid="chain-retry"
            disabled={chain.busy !== null} onClick={() => { void chain.retry(); }}>
            Try again
          </button>
        </>
      )}
      {chain.buildOnly ? null : (
        <button type="button" className="ghost" data-testid="chain-exit"
          onClick={() => { window.location.assign(chainUrl(false)); }}>
          Play offline instead
        </button>
      )}
    </>
  );
}

export default function ChainBar() {
  const chain = useChain();
  return (
    <div className="chain-bar" aria-label="On-chain">
      <span className="chain-dot" aria-hidden="true" />
      <span className="muted" data-testid="chain-status">
        NEAR testnet · <span data-testid="chain-account">{statusLine(chain)}</span>
      </span>
      <ChainTx chain={chain} />
      <ChainActions chain={chain} />
      <ChainSide chain={chain} />
    </div>
  );
}
