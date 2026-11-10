// App: session gate plus the single 1280x800 game screen.
// Top bar, sea chart, auction, boats, ledger and the judges drawer.
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { BoatView, FFResponse, GraphLive, JudgesLive, Mesh, PortState, ZoneId } from './types';
import { EMPTY_AUCTION, ZONE_LABEL } from './types';
import { useGame, useJudges } from './hooks';
import type { GameState } from './hooks';
import { doAssign, doCouncil, doDebt, doEndDay, doLicenceTrade, doReset, doRunFF, doSurvey } from './actions';
import { postLogin } from './api';
import type { Session } from './session';
import SeaMap from './components/SeaMap';
import AuctionPanel from './components/AuctionPanel';
import BoatsPanel from './components/BoatsPanel';
import LedgerPanel from './components/LedgerPanel';
import HarbourPanel from './components/HarbourPanel';
import JudgesPanel from './components/JudgesPanel';
import type { JudgeRun } from './components/JudgesPanel';
import type { StockPoint } from './components/Chart';
import { fmtGold } from './format';

function TopBar({ port, session, onLogout, judgesOpen, onJudges, onEndDay, dayBusy, onReset }: {
  port: PortState | null;
  session: Session;
  onLogout: () => void;
  judgesOpen: boolean;
  onJudges: (open: boolean) => void;
  onEndDay: () => void;
  dayBusy: boolean;
  onReset: () => void;
}) {
  return (
    <header className="topbar">
      <h1>Tidewater</h1>
      <span className="tide-stat">Week {port?.week ?? '—'} · {port?.day ?? '—'} · {port?.tide ?? '—'}</span>
      <span className="tide-stat gold">{port === null ? '—' : `${fmtGold(port.playerGold)}g`}</span>
      <span className="tide-stat">Quota left: {port?.quotaLeft ?? '—'}</span>
      <span className="muted">{session.name}</span>
      <button type="button" disabled={dayBusy} onClick={onEndDay}>
        End the day
      </button>
      <button type="button" className="ghost" disabled={dayBusy} onClick={onReset}>
        New harbour
      </button>
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

function ffToRun(ff: FFResponse, live: JudgesLive | null): JudgeRun {
  const days: number[] = Array.isArray(ff.series?.days) ? ff.series.days : [];
  const stocks: number[][] = Array.isArray(ff.series?.stocks) ? ff.series.stocks : [];
  const prices: number[] = Array.isArray(ff.series?.herring_price) ? ff.series.herring_price : [];
  const history: StockPoint[] = days.map((day, i) => ({
    day,
    shallows: stocks[i]?.[0] ?? 0,
    greybank: stocks[i]?.[1] ?? 0,
    deeps: stocks[i]?.[2] ?? 0,
    herringPrice: prices[i] ?? 0,
  }));
  return {
    seed: String(ff.summary?.seed ?? ''),
    days: ff.summary?.days_run ?? 0,
    hash: String(ff.summary?.history_hash ?? ''),
    history,
    events: Array.isArray(ff.journal) ? ff.journal : [],
    actors: (live?.actors ?? []).map((a) => ({ id: a.id, name: a.name, gold: a.gold, licences: a.licences, stopped: a.stopped })),
    goldTotal: live?.gold_total ?? 0,
    outsideIn: live?.ext_in ?? 0,
    outsideOut: live?.ext_out ?? 0,
  };
}

function livePoint(graph: GraphLive | null, judges: JudgesLive | null): StockPoint | null {
  if (graph === null || judges === null) return null;
  if (!Array.isArray(graph.stocks) || !Array.isArray(graph.history)) return null;
  const last = graph.history[graph.history.length - 1] as { herring_price?: unknown } | undefined;
  const price = typeof last?.herring_price === 'number' ? (last.herring_price as number) : 0;
  return { day: judges.day, shallows: graph.stocks[0] ?? 0, greybank: graph.stocks[1] ?? 0, deeps: graph.stocks[2] ?? 0, herringPrice: price };
}

function JudgeBench({ game, port, judges, graph }: { game: GameState; port: PortState | null; judges: JudgesLive | null; graph: GraphLive | null }) {
  const seed = port?.seed ?? 'tidewater';
  const run = game.ff === null ? null : ffToRun(game.ff, judges);
  const playerView = (port?.zones ?? []).map((z) => ({ zone: ZONE_LABEL[z.id], catchPerTrip: z.catchPerTrip, trend: z.trend }));
  return (
    <section className="panel judges" aria-label="Judges">
      <h2>Judges</h2>
      <p className="muted">Seed {seed}: same seed, same season.</p>
      <JudgesPanel
        running={game.busy === 'ff'}
        run={run}
        playerView={playerView}
        live={livePoint(graph, judges)}
        onRun={(days, seedText) => { void doRunFF(game.actions, days === 28 ? 28 : 7, seedText); }}
      />
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
        <AuctionPanel
          auction={port?.auction ?? EMPTY_AUCTION}
          buyers={port?.buyers ?? []}
          landings={port?.landings ?? []}
          dayKey={`${port?.week ?? 0}-${port?.day ?? ''}`}
        />
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

function EndScreen({ port, you, onReset }: { port: PortState; you: { gold: number; licences: number }; onReset: () => void }) {
  return (
    <section className="end-screen" aria-label="Season over">
      <div className="panel end-card">
        <h2>The harbour lets you go</h2>
        <p className="muted">Week {port.week} · {port.day}. Your boats are laid up.</p>
        <ul className="harbour-list">
          <li><span>Net worth</span><span className="num">{fmtGold(port.netWorth)}g</span></li>
          <li><span>Gold</span><span className="num">{fmtGold(you.gold)}g</span></li>
          <li><span>Licences</span><span className="num">{you.licences}</span></li>
        </ul>
        <button type="button" onClick={onReset}>
          New harbour
        </button>
      </div>
    </section>
  );
}

function GameScreen({ game, session }: { game: GameState; session: Session }) {
  const port = game.port;
  const selected = findBoat(port, game.selectedBoat);
  const dayKey = `${port?.week ?? 0}-${port?.day ?? ''}`;
  const { judges, graph } = useJudges(dayKey, game.busy);
  const you = port?.captains.find((c) => c.id === 'you') ?? null;
  const ended = you !== null && !you.active;
  return (
    <>
      <TopBar
        port={port}
        session={session}
        onLogout={game.logout}
        judgesOpen={game.judgesOpen}
        onJudges={game.setJudgesOpen}
        onEndDay={() => { void doEndDay(game.actions); }}
        dayBusy={game.busy !== null}
        onReset={() => { void doReset(game.actions); }}
      />
      {game.offline && (
        <p className="offline-banner">Relay unreachable — showing last known harbour. Start the relay to play live.</p>
      )}
      <Board game={game} port={port} selected={selected} />
      <LedgerPanel landings={port?.landings ?? []} reasoning={port?.reasoning ?? []} />
      <HarbourPanel
        captains={port?.captains ?? []}
        loans={judges?.loans ?? []}
        licencePool={judges?.licence_pool ?? 0}
        proposal={judges?.proposal ?? null}
        playerGold={port?.playerGold ?? 0}
        youLicences={you?.licences ?? 0}
        busy={game.busy !== null}
        onSurvey={(zone) => { void doSurvey(game.actions, zone); }}
        onLicence={(action, ref) => { void doLicenceTrade(game.actions, action, ref); }}
        onDebt={(action, ref) => { void doDebt(game.actions, action, ref); }}
        onPropose={(rule, indemnity) => { void doCouncil(game.actions, 'propose', rule, indemnity); }}
        onVote={(yes) => { void doCouncil(game.actions, 'vote', yes ? 'yes' : 'no'); }}
      />
      {game.judgesOpen && <JudgeBench game={game} port={port} judges={judges} graph={graph} />}
      {ended && you !== null && port !== null && (
        <EndScreen port={port} you={you} onReset={() => { void doReset(game.actions); }} />
      )}
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
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return;
      game.setSelectedBoat(null);
      game.setJudgesOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game]);
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
