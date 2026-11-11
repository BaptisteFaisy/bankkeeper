// App: session gate plus the single 1280x800 game screen.
// Top bar, sea chart, auction, boats, ledger and the judges drawer.
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { BoatView, CouncilOutcome, DayNote, GraphLive, JudgesLive, Mesh, PortState, SeasonBilan, ZoneId } from './types';
import { parseBilan, parseCouncilOutcome } from './types';
import { useGame, useJudges } from './hooks';
import type { GameState } from './hooks';
import { doAssign, doClaim, doCouncil, doDebt, doEndDay, doFallow, doLicenceTrade, doNewCampaign, doNextSeason, doReset, doReseed, doSurvey } from './actions';
import type { GameActions } from './actions';
import type { BootResult } from './boot';
import type { Session } from './session';
import type { Charter } from './charter';
import Stage from './components/Stage';
import LedgerPanel from './components/LedgerPanel';
import HarbourPanel from './components/HarbourPanel';
import Auth from './components/Auth';
import ChainBar from './components/ChainBar';
import ChroniclePanel from './components/ChroniclePanel';
import CharterScreen from './components/CharterScreen';
import { Tutorial, useTutorial } from './components/Tutorial';
import TopBar from './components/TopBar';
import JudgeBench from './components/JudgeBench';
import SeedOffer from './components/SeedOffer';
import ToastStack from './components/Toasts';
import { fmtCrates, fmtGold } from './format';
import { ChainProvider, useChain } from './near/chainProvider';

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

// The harbour office, wired to the shared actions: surveys, licences, the
// sea debt and the council. Split out so PlayPanels stays about layout.
function HarbourOffice({ game, port, judges, youLicences, council, over }: {
  game: GameState;
  port: PortState | null;
  judges: JudgesLive | null;
  youLicences: number;
  council: CouncilOutcome | null;
  over: boolean;
}) {
  return (
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
  );
}

// The sea chart is a scene now: Stage owns the replay so the criee panel
// and the canvas instruments show the same lot at the same centime.
function PlayStage({ game, port, selected, over }: {
  game: GameState;
  port: PortState | null;
  selected: BoatView | null;
  over: boolean;
}) {
  function chartAssign(zone: ZoneId | null): void {
    if (over) {
      game.actions.pushToast('info', 'The season is over. Start a new harbour to sail again.');
      return;
    }
    guardedAssign(game, selected, zone);
  }
  function pickBoat(id: string): void {
    const boat = findBoat(port, id);
    if (boat !== null && !boat.mine) {
      game.actions.pushToast('info', `${boat.name} sails for ${boat.captain}.`);
      return;
    }
    game.setSelectedBoat(id === game.selectedBoat ? null : id);
  }
  return (
    <Stage
      port={port}
      selectedBoat={game.selectedBoat}
      busy={game.busy !== null}
      over={over}
      onPickBoat={pickBoat}
      onPickZone={(zone) => chartAssign(zone)}
      onPickQuay={() => chartAssign(null)}
      onSelectBoat={game.setSelectedBoat}
      onAssign={(boat, zone) => guardedAssign(game, boat, zone)}
      onMesh={(boat, mesh) => guardedMesh(game, boat, mesh)}
    />
  );
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
      <PlayStage game={game} port={port} selected={selected} over={over} />
      <div className="panels">
        <LedgerPanel
          landings={port?.landings ?? []}
          reasoning={port?.reasoning ?? []}
          sea={port?.sea ?? null}
          dispute={port?.dispute ?? null}
          busy={game.busy !== null}
          onFallow={(zone, weeks) => { void doFallow(game.actions, zone, weeks); }}
          onReseed={(zone, crates) => { void doReseed(game.actions, zone, crates); }}
          onClaim={(actor, gold) => { void doClaim(game.actions, actor, gold); }}
        />
        <HarbourOffice game={game} port={port} judges={judges} youLicences={youLicences} council={council} over={over} />
        <ChroniclePanel entries={port?.chronicle ?? []} charter={port?.charter ?? null} />
      </div>
    </>
  );
}

// The charter is kept by the browser and handed to `init`: the next campaign
// starts one seed further on, under the sentence the player just wrote.
function sailUnder(actions: GameActions, port: PortState, charter: Charter): void {
  const seed = Number.parseInt(port.seed ?? '7', 10);
  const next = { seed: (Number.isFinite(seed) ? seed : 7) + 1, weeks: port.weeksPerSeason ?? 2, charter };
  void doNewCampaign(actions, next);
}

// The header strip: the clock, the readings and the three doors. Split out
// of GameScreen so that function stays about the game, not about props.
function HarbourTopBar({ game, session, judgesRef, end, noted, onHowToPlay }: {
  game: GameState;
  session: Session;
  judgesRef: RefObject<HTMLButtonElement>;
  end: OverState;
  noted: GameActions;
  onHowToPlay: () => void;
}) {
  return (
    <TopBar
      port={game.port}
      session={session}
      onLogout={game.logout}
      judgesOpen={game.judgesOpen}
      onJudges={game.setJudgesOpen}
      judgesRef={judgesRef}
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
  );
}

function GameScreen({ game, session, judgesRef, onHowToPlay }: {
  game: GameState;
  session: Session;
  judgesRef: RefObject<HTMLButtonElement>;
  onHowToPlay: () => void;
}) {
  const chain = useChain();
  const port = game.port;
  const selected = findBoat(port, game.selectedBoat);
  const dayKey = `${port?.week ?? 0}-${port?.day ?? ''}`;
  const { judges, graph } = useJudges(dayKey, game.busy);
  const { dayNote, noted } = useDayNote(game);
  const you = port?.captains.find((c) => c.id === 'you') ?? null;
  const end = overState(port, graph, dayNote, you !== null && !you.active);
  // The campaign's last bilan outranks a bankruptcy: the port still asks for
  // its charter, so the overlay must not cover the screen that writes it.
  const campaignDone = port !== null && port.seasonOver === true && port.campaignOver === true;
  return (
    <>
      {(end.seasonOver || campaignDone) && you !== null && port !== null && (
        <EndScreen port={port} you={you} bilan={end.bilan} stocks={end.stocks} council={end.council} seasonOver onReset={() => { void doReset(noted); }} onNextSeason={() => { void doNextSeason(noted); }} />
      )}
      <HarbourTopBar game={game} session={session} judgesRef={judgesRef} end={end} noted={noted} onHowToPlay={onHowToPlay} />
      {game.offline && (
        <p className="offline-banner">Relay unreachable — showing last known harbour. Start the relay to play live.</p>
      )}
      {chain.enabled && <ChainBar />}
      <PlayPanels game={game} port={port} selected={selected} judges={judges} youLicences={you?.licences ?? 0} council={end.council} over={end.over} />
      {game.judgesOpen && <JudgeBench game={game} port={port} judges={judges} graph={graph} />}
      {campaignDone && port !== null && (
        <CharterScreen busy={game.busy !== null} onSail={(charter) => sailUnder(noted, port, charter)} />
      )}
      {end.bankrupt && !campaignDone && you !== null && port !== null && (
        <EndScreen port={port} you={you} bilan={end.bilan} stocks={end.stocks} council={end.council} seasonOver={false} onReset={() => { void doReset(noted); }} onNextSeason={() => { void doNextSeason(noted); }} />
      )}
    </>
  );
}

/** Escape closes the judges drawer and hands the focus back to its trigger. */
function useEscape(game: GameState, judgesRef: RefObject<HTMLButtonElement>): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return;
      game.setSelectedBoat(null);
      if (!game.judgesOpen) return;
      game.setJudgesOpen(false);
      judgesRef.current?.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, judgesRef]);
}

/** The boot report: one toast for anything the startup had to work around. */
function useBootNotice(game: GameState, boot: BootResult): void {
  const notice = boot.notice;
  const pushRef = useRef(game.actions.pushToast);
  pushRef.current = game.actions.pushToast;
  useEffect(() => {
    if (notice === null) return;
    pushRef.current(notice.kind, notice.title, notice.body);
  }, [notice]);
}

export default function App({ boot }: { boot: BootResult }) {
  const game = useGame();
  const tutorial = useTutorial();
  const judgesRef = useRef<HTMLButtonElement>(null);
  useEscape(game, judgesRef);
  useBootNotice(game, boot);
  const toasts = <ToastStack toasts={game.toasts} onDismiss={game.dismissToast} />;
  const offer = boot.seedOffer === null ? null : <SeedOffer offer={boot.seedOffer} game={game} />;
  const screen = game.session === null ? (
    <div className="app">
      <header className="topbar"><h1>Tidewater</h1></header>
      {offer}
      <Auth onLogin={game.login} />
      {toasts}
    </div>
  ) : (
    <div className="app">
      {offer}
      <GameScreen game={game} session={game.session} judgesRef={judgesRef} onHowToPlay={tutorial.show} />
      {tutorial.open && <Tutorial onClose={tutorial.close} />}
      {toasts}
    </div>
  );
  // One chain session wraps both screens: the login card opens the NEAR
  // account, the strip above the harbour shows it. Offline it never fetches.
  return <ChainProvider email={game.session?.email ?? ''}>{screen}</ChainProvider>;
}
