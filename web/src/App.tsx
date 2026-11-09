// App: session gate plus the single 1280x800 game screen.
// Top bar, sea chart, auction, boats, ledger and the judges drawer.
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { BoatView, FFResponse, Mesh, PortState, ZoneId } from './types';
import { EMPTY_AUCTION } from './types';
import { useGame } from './hooks';
import type { GameState } from './hooks';
import { doAssign, doLicenceBuy, doRunFF } from './actions';
import { postLogin } from './api';
import type { Session } from './session';
import SeaMap from './components/SeaMap';
import AuctionPanel from './components/AuctionPanel';
import BoatsPanel from './components/BoatsPanel';
import LedgerPanel from './components/LedgerPanel';

function TopBar({ port, session, onLogout, judgesOpen, onJudges }: {
  port: PortState | null;
  session: Session;
  onLogout: () => void;
  judgesOpen: boolean;
  onJudges: (open: boolean) => void;
}) {
  return (
    <header className="topbar">
      <h1>Tidewater</h1>
      <span className="tide-stat">Week {port?.week ?? '—'} · {port?.day ?? '—'} · {port?.tide ?? '—'}</span>
      <span className="tide-stat gold">{port?.playerGold ?? '—'}g</span>
      <span className="tide-stat">Quota left: {port?.quotaLeft ?? '—'}</span>
      <span className="muted">{session.name}</span>
      <button type="button" className="ghost" onClick={() => onJudges(!judgesOpen)} aria-expanded={judgesOpen}>
        Judges
      </button>
      <button type="button" className="ghost" onClick={onLogout}>Log out</button>
    </header>
  );
}

function AuthGate({ onLogin }: { onLogin: (email: string, name: string) => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  function submit(e: FormEvent): void {
    e.preventDefault();
    if (email.trim() === '') return;
    const captain = name.trim() === '' ? 'Skipper' : name.trim();
    // Best effort: the relay records the captain, but the local
    // session is enough to play if the relay is still starting.
    postLogin(email.trim(), captain).catch(() => undefined);
    onLogin(email.trim(), captain);
  }
  return (
    <form className="auth-card" onSubmit={submit}>
      <h2>Take command</h2>
      <p className="muted">Sign in with your email. No wallet, no seed phrase, no gas.</p>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Captain name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Skipper" />
      </label>
      <button type="submit">Set sail</button>
    </form>
  );
}

function findBoat(port: PortState | null, id: string | null): BoatView | null {
  if (port === null || id === null) return null;
  return port.boats.find((b) => b.id === id) ?? null;
}

// Client-side guards toast here instead of a server 409, which would
// also surface as noise on normal play.
function assignBlock(boat: BoatView | null): string | null {
  if (boat === null) return 'Pick one of your boats first.';
  if (!boat.mine) return 'Only your own boats take orders.';
  if (boat.disarmed) return 'That boat is disarmed.';
  return null;
}

function guardedAssign(game: GameState, boat: BoatView | null, zone: ZoneId | null): void {
  const block = assignBlock(boat);
  if (block !== null || boat === null) {
    game.actions.pushToast('error', block ?? 'Pick one of your boats first.');
    return;
  }
  void doAssign(game.actions, { boat: boat.id, zone, net: boat.mesh }, boat.name).then((ok) => {
    if (ok) game.setSelectedBoat(null);
  });
}

function guardedMesh(game: GameState, boat: BoatView, mesh: Mesh): void {
  if (!boat.mine || boat.disarmed) {
    game.actions.pushToast('error', 'Only your own boats take orders.');
    return;
  }
  if (boat.zone !== null || boat.trip !== null) {
    game.actions.pushToast('error', 'The net can only be changed at the quay.');
    return;
  }
  void doAssign(game.actions, { boat: boat.id, zone: null, net: mesh }, boat.name);
}

function JudgesDrawer({ game, port }: { game: GameState; port: PortState | null }) {
  const ff: FFResponse | null = game.ff;
  const running = game.busy === 'ff';
  const seed = port?.seed ?? 'tidewater';
  return (
    <section className="panel judges" aria-label="Judges">
      <h2>Judges</h2>
      <p className="muted">Seed {seed}: same seed, same season.</p>
      <div className="judge-row">
        <button type="button" disabled={running} onClick={() => { void doRunFF(game.actions, 7, seed); }}>
          Fast-forward 7 days
        </button>
        <button type="button" disabled={running} onClick={() => { void doRunFF(game.actions, 28, seed); }}>
          Fast-forward 28 days
        </button>
        {ff !== null && <span className="muted">Hash {ff.summary.history_hash} · {ff.summary.events} events</span>}
        {game.port !== null && (
          <button type="button" className="ghost" disabled={game.busy !== null} onClick={() => { void doLicenceBuy(game.actions); }}>
            Buy licence
          </button>
        )}
      </div>
      {ff !== null && ff.journal.length > 0 && (
        <ul className="event-list">
          {ff.journal.slice(-8).map((e, i) => (
            <li key={i}>Day {e.day} · {e.kind}: {e.detail}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Board({ game, port, selected }: { game: GameState; port: PortState | null; selected: BoatView | null }) {
  return (
    <main className="board">
      <section className="panel chart-panel" aria-label="Sea chart">
        <h2>Sea chart</h2>
        <SeaMap
          zones={port?.zones ?? []}
          boats={port?.boats ?? []}
          buyers={port?.buyers ?? []}
          captains={port?.captains ?? []}
          selectedBoat={game.selectedBoat}
          onPickBoat={(id) => {
            const boat = findBoat(port, id);
            if (boat !== null && !boat.mine) {
              game.actions.pushToast('info', `${boat.name} sails for ${boat.captain}.`);
              return;
            }
            game.setSelectedBoat(id === game.selectedBoat ? null : id);
          }}
          onPickZone={(zone) => guardedAssign(game, selected, zone)}
          onPickQuay={() => guardedAssign(game, selected, null)}
        />
      </section>
      <div className="side">
        <AuctionPanel auction={port?.auction ?? EMPTY_AUCTION} buyers={port?.buyers ?? []} />
        <BoatsPanel
          boats={port?.boats ?? []}
          selectedBoat={game.selectedBoat}
          busy={game.busy !== null}
          onSelectBoat={game.setSelectedBoat}
          onAssign={(boat, zone) => guardedAssign(game, boat, zone)}
          onMesh={(boat, mesh) => guardedMesh(game, boat, mesh)}
        />
      </div>
    </main>
  );
}

function GameScreen({ game, session }: { game: GameState; session: Session }) {
  const port = game.port;
  const selected = findBoat(port, game.selectedBoat);
  return (
    <>
      <TopBar
        port={port}
        session={session}
        onLogout={game.logout}
        judgesOpen={game.judgesOpen}
        onJudges={game.setJudgesOpen}
      />
      {game.offline && (
        <p className="offline-banner">Relay unreachable — showing last known harbour. Start the relay to play live.</p>
      )}
      <Board game={game} port={port} selected={selected} />
      <LedgerPanel landings={port?.landings ?? []} reasoning={port?.reasoning ?? []} />
      {game.judgesOpen && <JudgesDrawer game={game} port={port} />}
    </>
  );
}

function ToastStack({ game }: { game: GameState }) {
  if (game.toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {game.toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <div>
            <strong>{t.title}{t.count > 1 && <span className="toast-count">×{t.count}</span>}</strong>
            {t.body && <p>{t.body}</p>}
          </div>
          <button onClick={() => game.dismissToast(t.id)} type="button" className="ghost">Dismiss</button>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const game = useGame();
  if (game.session === null) {
    return (
      <div className="app">
        <header className="topbar"><h1>Tidewater</h1></header>
        <AuthGate onLogin={game.login} />
        <ToastStack game={game} />
      </div>
    );
  }
  return (
    <div className="app">
      <GameScreen game={game} session={game.session} />
      <ToastStack game={game} />
    </div>
  );
}
