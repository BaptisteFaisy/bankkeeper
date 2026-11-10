// App: session gate plus the single 1280x800 game screen.
// Top bar, sea chart, auction, boats, ledger and the judges drawer.
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { BoatView, CouncilOutcome, DayNote, FFResponse, GraphLive, JudgesLive, Mesh, PortState, SeasonBilan, ZoneId } from './types';
import { EMPTY_AUCTION, ZONE_LABEL, parseBilan, parseCouncilOutcome } from './types';
import { useGame, useJudges } from './hooks';
import type { GameState } from './hooks';
import { doAssign, doCouncil, doDebt, doEndDay, doLicenceTrade, doNextSeason, doReset, doRunFF, doSurvey } from './actions';
import type { GameActions } from './actions';
import { postLogin } from './api';
import type { Session } from './session';
import SeaMap from './components/SeaMap';
import AuctionPanel from './components/AuctionPanel';
import BoatsPanel from './components/BoatsPanel';
import LedgerPanel from './components/LedgerPanel';
import HarbourPanel from './components/HarbourPanel';
import ChainBar from './components/ChainBar';
import { ClockControls, CopyLink, HowToPlay } from './components/HeaderControls';
import { Tutorial, useTutorial } from './components/Tutorial';
import JudgesPanel from './components/JudgesPanel';
import type { JudgeRun } from './components/JudgesPanel';
import type { StockPoint } from './components/Chart';
import { fmtCrates, fmtGold } from './format';
import { CHAIN_ENABLED } from './near/chain';

function TopBar({ port, session, onLogout, judgesOpen, onJudges, onEndDay, dayBusy, over, onReset, live, setLive, secondsLeft, nextLot, onHowToPlay }: {
  port: PortState | null;
  session: Session;
  onLogout: () => void;
  judgesOpen: boolean;
  onJudges: (open: boolean) => void;
  onEndDay: () => void;
  dayBusy: boolean;
  over: boolean;
  onReset: () => void;
  live: boolean;
  setLive: (on: boolean) => void;
  secondsLeft: number;
  nextLot: () => void;
  onHowToPlay: () => void;
}) {
  return (
    <header className="topbar">
      <h1>Tidewater</h1>
      <span className="tide-stat">Week {port?.week ?? '—'} · {port?.day ?? '—'} · {port?.tide ?? '—'}</span>
      <span className="tide-stat gold">{port === null ? '—' : `${fmtGold(port.playerGold)}g`}</span>
      <span className="tide-stat">Quota left: {port?.quotaLeft ?? '—'}</span>
      {port !== null && (port.campaignSeasons ?? 1) > 1 ? (
        <span className="tide-stat">Season {port.season ?? 1} of {port.campaignSeasons}</span>
      ) : null}
      <span className="muted">{session.name}</span>
      <ClockControls
        live={live}
        setLive={setLive}
        secondsLeft={secondsLeft}
        nextLot={nextLot}
        onEndDay={onEndDay}
        busy={dayBusy}
        over={over}
      />
      <HowToPlay onOpen={onHowToPlay} />
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
  const seasonDays = port?.seasonDays ?? 28;
  const run = game.ff === null ? null : ffToRun(game.ff, judges);
  const playerView = (port?.zones ?? []).map((z) => ({ zone: ZONE_LABEL[z.id], catchPerTrip: z.catchPerTrip, trend: z.trend }));
  return (
    <section className="panel judges" aria-label="Judges">
      <h2>Judges</h2>
      <p className="muted">
        Seed {seed}, {seasonDays} days a season: same seed, same season. <CopyLink game={game} port={port} />
      </p>
      <JudgesPanel
        running={game.busy === 'ff'}
        run={run}
        playerView={playerView}
        live={livePoint(graph, judges)}
        harbourSeed={String(port?.seed ?? judges?.seed ?? 'tidewater')}
        onRun={(days, seedText) => { void doRunFF(game.actions, days === 28 ? 28 : 7, seedText); }}
      />
    </section>
  );
}

function Board({ game, port, selected, over }: { game: GameState; port: PortState | null; selected: BoatView | null; over: boolean }) {
  function chartAssign(zone: ZoneId | null): void {
    if (over) {
      game.actions.pushToast('info', 'The season is over. Start a new harbour to sail again.');
      return;
    }
    guardedAssign(game, selected, zone);
  }
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
          onPickZone={(zone) => chartAssign(zone)}
          onPickQuay={() => chartAssign(null)}
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
          busy={game.busy !== null || over}
          onSelectBoat={game.setSelectedBoat}
          onAssign={(boat, zone) => guardedAssign(game, boat, zone)}
          onMesh={(boat, mesh) => guardedMesh(game, boat, mesh)}
        />
      </div>
    </main>
  );
}

function councilLine(council: CouncilOutcome | null): string {
  if (council === null) return 'No council this season.';
  if (!council.tabled) return `Season ${council.season}: no motion tabled.`;
  return `Season ${council.season}: ${council.forVotes} for, ${council.againstVotes} against — ${council.passed ? 'passed' : 'rejected'}.`;
}

interface EndProps {
  port: PortState;
  you: { gold: number; licences: number };
  bilan: SeasonBilan | null;
  stocks: [number, number, number];
  council: CouncilOutcome | null;
  seasonOver: boolean;
  onReset: () => void;
  onNextSeason: () => void;
}

function campagneLine(port: PortState): string | null {
  const season = port.season ?? 1;
  const total = port.campaignSeasons ?? 1;
  if (total <= 1) return null;
  return `Season ${season} of ${total}${port.campaignOver ? ' — campaign complete' : ''}`;
}

function EndCardBody({ port, you, bilan, stocks, council, seasonOver, onReset, onNextSeason }: EndProps) {
  const campaign = campagneLine(port);
  const nextSeason = seasonOver && port.campaignOver !== true;
  // Barreau 4: the second column of the bilan, in crates. The season's own
  // line when the bilan carries it, the campaign's liability otherwise.
  const seaDebt = bilan?.seaDebtTotal ?? port.sea?.debt ?? 0;
  return (
    <>
      <h2>{seasonOver ? (port.campaignOver ? 'Campaign over — the last bilan' : 'Season over — the bilan') : 'The harbour lets you go'}</h2>
      <p className="muted">
        Week {port.week} · {port.day}. {seasonOver ? 'The books are closed.' : 'Your boats are laid up.'}
        {campaign === null ? null : ` ${campaign}.`}
      </p>
      <ul className="harbour-list">
        <li><span>Net worth</span><span className="num">{fmtGold(bilan?.netWorth ?? port.netWorth)}g</span></li>
        <li><span>Gold</span><span className="num">{fmtGold(you.gold)}g</span></li>
        <li><span>Licences</span><span className="num">{bilan?.licences ?? you.licences}</span></li>
        <li><span>Stocks left</span><span className="num">{stocks[0]} · {stocks[1]} · {stocks[2]}</span></li>
        <li><span>Debt to the sea</span><span className="num">{fmtCrates(seaDebt)} crates</span></li>
        <li><span>Last council</span><span>{councilLine(council)}</span></li>
      </ul>
      {nextSeason ? (
        <button type="button" onClick={onNextSeason}>
          Sail the next season
        </button>
      ) : null}
      <button type="button" className={nextSeason ? 'ghost' : undefined} onClick={onReset}>
        New harbour
      </button>
      {nextSeason ? (
        <p className="muted">Your purse, licences and hulls carry over. The sea keeps what this season left it.</p>
      ) : null}
    </>
  );
}

// Bankruptcy keeps the full overlay; season over shows the same card
// in flow so the judges bench stays readable.
function EndScreen(props: EndProps) {
  if (!props.seasonOver) {
    return (
      <section className="end-screen" aria-label="Season over">
        <div className="panel end-card">
          <EndCardBody {...props} />
        </div>
      </section>
    );
  }
  return (
    <section className="panel" aria-label="Season over">
      <EndCardBody {...props} />
    </section>
  );
}

function graphStocks(graph: GraphLive | null): [number, number, number] {
  const s = graph?.stocks;
  if (Array.isArray(s) && s.length >= 3 && s.every((n) => typeof n === 'number')) {
    return [Math.round(s[0]), Math.round(s[1]), Math.round(s[2])];
  }
  return [0, 0, 0];
}

interface OverState {
  bankrupt: boolean;
  seasonOver: boolean;
  over: boolean;
  council: CouncilOutcome | null;
  bilan: SeasonBilan | null;
  stocks: [number, number, number];
}

// Season over arrives from state (seasonOver) or the last day
// (season_over); the bilan and the council minutes prefer the day
// snapshot, then state (state survives a reload).
function overState(port: PortState | null, graph: GraphLive | null, dayNote: DayNote | null, bankrupt: boolean): OverState {
  const seasonOver = !bankrupt && (port?.seasonOver === true || dayNote?.seasonOver === true);
  const bilan = parseBilan(dayNote?.bilan ?? port?.bilan ?? null, port?.netWorth);
  return {
    bankrupt,
    seasonOver,
    over: bankrupt || seasonOver,
    council: dayNote?.council ?? parseCouncilOutcome(port?.lastCouncil ?? null),
    bilan,
    stocks: bilan?.stocks ?? graphStocks(graph),
  };
}

function useDayNote(game: GameState): { dayNote: DayNote | null; noted: GameActions } {
  const [dayNote, setDayNote] = useState<DayNote | null>(null);
  const noted: GameActions = { ...game.actions, noteDay: (note: DayNote) => setDayNote(note) };
  return { dayNote, noted };
}

function PlayPanels({ game, port, selected, judges, youLicences, council, over }: {
  game: GameState;
  port: PortState | null;
  selected: BoatView | null;
  judges: JudgesLive | null;
  youLicences: number;
  council: CouncilOutcome | null;
  over: boolean;
}) {
  return (
    <>
      <Board game={game} port={port} selected={selected} over={over} />
      <LedgerPanel landings={port?.landings ?? []} reasoning={port?.reasoning ?? []} />
      <HarbourPanel
        captains={port?.captains ?? []}
        loans={judges?.loans ?? []}
        licencePool={judges?.licence_pool ?? 0}
        proposal={judges?.proposal ?? null}
        lastCouncil={council}
        playerGold={port?.playerGold ?? 0}
        licencePrice={port?.licencePrice}
        youLicences={youLicences}
        busy={game.busy !== null || over}
        onSurvey={(zone) => { void doSurvey(game.actions, zone); }}
        onLicence={(action, ref) => { void doLicenceTrade(game.actions, action, ref); }}
        onDebt={(action, ref) => { void doDebt(game.actions, action, ref); }}
        onPropose={(rule, indemnity) => { void doCouncil(game.actions, 'propose', rule, indemnity); }}
        onVote={(yes) => { void doCouncil(game.actions, 'vote', yes ? 'yes' : 'no'); }}
      />
    </>
  );
}

function GameScreen({ game, session, onHowToPlay }: { game: GameState; session: Session; onHowToPlay: () => void }) {
  const port = game.port;
  const selected = findBoat(port, game.selectedBoat);
  const dayKey = `${port?.week ?? 0}-${port?.day ?? ''}`;
  const { judges, graph } = useJudges(dayKey, game.busy);
  const { dayNote, noted } = useDayNote(game);
  const you = port?.captains.find((c) => c.id === 'you') ?? null;
  const end = overState(port, graph, dayNote, you !== null && !you.active);
  return (
    <>
      {end.seasonOver && you !== null && port !== null && (
        <EndScreen port={port} you={you} bilan={end.bilan} stocks={end.stocks} council={end.council} seasonOver onReset={() => { void doReset(noted); }} onNextSeason={() => { void doNextSeason(noted); }} />
      )}
      <TopBar
        port={port}
        session={session}
        onLogout={game.logout}
        judgesOpen={game.judgesOpen}
        onJudges={game.setJudgesOpen}
        onEndDay={() => { void doEndDay(noted); }}
        dayBusy={game.busy !== null}
        over={end.over}
        onReset={() => { void doReset(noted); }}
        live={game.live}
        setLive={game.setLive}
        secondsLeft={game.secondsLeft}
        nextLot={game.nextLot}
        onHowToPlay={onHowToPlay}
      />
      {game.offline && (
        <p className="offline-banner">Relay unreachable — showing last known harbour. Start the relay to play live.</p>
      )}
      {CHAIN_ENABLED && <ChainBar email={session.email} />}
      <PlayPanels game={game} port={port} selected={selected} judges={judges} youLicences={you?.licences ?? 0} council={end.council} over={end.over} />
      {game.judgesOpen && <JudgeBench game={game} port={port} judges={judges} graph={graph} />}
      {end.bankrupt && you !== null && port !== null && (
        <EndScreen port={port} you={you} bilan={end.bilan} stocks={end.stocks} council={end.council} seasonOver={false} onReset={() => { void doReset(noted); }} onNextSeason={() => { void doNextSeason(noted); }} />
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
  const tutorial = useTutorial();
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
      <GameScreen game={game} session={game.session} onHowToPlay={tutorial.show} />
      {tutorial.open && <Tutorial onClose={tutorial.close} />}
      <ToastStack game={game} />
    </div>
  );
}
