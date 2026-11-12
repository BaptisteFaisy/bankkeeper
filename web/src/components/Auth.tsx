// The login card: an email, a captain name, and one honest door to the chain.
//
// Offline (the default) the email only labels a local captain. In chain mode
// (`?chain`) the same email becomes a real NEAR testnet account: the relayer
// signs and pays, so the player still sees no wallet, no recovery phrase and
// no gas prompt. A refusal is never a dead screen — the card says what went
// wrong and offers the offline harbour.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { postLogin } from '../api';
import { chainUrl } from '../near/chain';
import { useChain } from '../near/chainProvider';
import type { ChainValue } from '../near/chainProvider';

interface Props {
  onLogin: (email: string, name: string) => void;
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** The captain's name: the mailbox's own word, capitalised. Nothing to fill in. */
function captainName(email: string): string {
  const local = email.trim().split('@')[0] ?? '';
  const word = (local.replace(/[._-]+/g, ' ').trim().split(' ')[0] ?? '').slice(0, 24);
  return word === '' ? 'Captain' : word.charAt(0).toUpperCase() + word.slice(1);
}

const ENTER_TEXT = 'On chain your email becomes a real NEAR testnet account and the house pays '
  + 'the gas. There is no recovery phrase: nothing to write down, and nothing to carry away. '
  + 'The offline harbour stays the default and needs no server.';

const MODE_TEXT = 'On-chain mode (testnet): your email becomes a real NEAR testnet account, the '
  + 'house pays the gas, and there is no recovery phrase. No wallet, no seed phrase, no gas prompt.';

function leave(): void {
  window.location.assign(chainUrl(false));
}

/** The door in both directions, and the live line that says what it changes. */
function ChainDoor({ chain, status }: { chain: ChainValue; status: string }) {
  if (!chain.enabled) {
    return (
      <div className="chain-door" data-testid="chain-door">
        <button
          type="button"
          className="ghost"
          data-testid="chain-enter"
          onClick={() => { window.location.assign(chainUrl(true)); }}
        >
          Play on chain (testnet)
        </button>
        <p>{ENTER_TEXT}</p>
      </div>
    );
  }
  return (
    <div className="chain-door" data-testid="chain-door">
      <p>{MODE_TEXT}</p>
      <p className="chain-status" role="status" aria-live="polite" data-testid="chain-door-status">
        {status}
      </p>
      {chain.buildOnly ? (
        <p className="muted">This build is chain-only: there is no offline mode to go back to.</p>
      ) : (
        <button type="button" className="ghost" data-testid="chain-exit" onClick={leave}>
          Play offline instead
        </button>
      )}
    </div>
  );
}

export default function Auth({ onLogin }: Props) {
  const chain = useChain();
  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState('');

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!validEmail(email)) {
      setLocalError('Enter a valid email address.');
      return;
    }
    setLocalError('');
    const captain = captainName(email);
    // Best effort: the harbour records the captain, but the local session is
    // enough to play if that relay is still starting.
    postLogin(email.trim(), captain).catch(() => undefined);
    if (!chain.enabled) {
      onLogin(email.trim(), captain);
      return;
    }
    // Chain mode: the email opens the NEAR account first. A refusal keeps the
    // player on this card, with the message and the offline way out.
    if (await chain.login(email.trim())) onLogin(email.trim(), captain);
  }

  const problem = localError !== '' ? localError : chain.error;
  const opening = chain.busy === 'login';
  const status = opening
    ? 'Opening your NEAR account on testnet…'
    : (chain.position === null ? '' : `NEAR account ${chain.position.accountId}`);

  return (
    <form className="auth-card" onSubmit={(event) => { void submit(event); }}>
      <h2>Take command</h2>
      <p className="muted">Sign in with your email. No wallet, no seed phrase, no gas.</p>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          data-testid="auth-email"
        />
      </label>
      {problem === null || problem === '' ? null : (
        <p className="error" role="alert" data-testid="auth-error">{problem}</p>
      )}
      <button type="submit" disabled={chain.busy !== null} data-testid="auth-submit">
        {opening ? 'Opening your NEAR account…' : 'Set sail'}
      </button>
      {chain.enabled && chain.error !== null && !chain.buildOnly ? (
        <button type="button" className="ghost" data-testid="chain-fallback" onClick={leave}>
          Continue offline instead
        </button>
      ) : null}
      <ChainDoor chain={chain} status={status} />
    </form>
  );
}
