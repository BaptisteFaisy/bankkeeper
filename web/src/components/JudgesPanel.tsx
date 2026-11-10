// Judges bench: fast-forward the harbour 7 or 28 days with no player,
// then audit the run. Shows the graph (real stock, herring price,
// bankruptcies), every actor gold plus licences, the gold total with
// cumulative outside flows, and the seed. The truth table sets the
// real stock next to what the player sees. The last run persists
// across reloads. No animation anywhere.
import { useEffect, useState } from 'react';
import Chart from './Chart';
import { fmtGold } from '../format';
import type { JudgeEvent, StockPoint } from './Chart';

export interface ActorStanding {
  id: string;
  name: string;
  gold: number;
  licences: number;
  stopped: boolean;
}

// Barreau 2: the port fund, gold the harbour holds in common. The payload is
// the judges view's own `fund` object; a run saved before the fund has none.
export interface PortFund {
  balance: number;
  paid_in: number;
  paid_out: number;
}

export interface JudgeRun {
  seed: string;
  days: number;
  hash: string;
  history: StockPoint[];
  events: JudgeEvent[];
  actors: ActorStanding[];
  goldTotal: number;
  outsideIn: number;
  outsideOut: number;
  fund?: PortFund;
}

export type Trend = 'rising' | 'steady' | 'falling';

export interface ZoneView {
  zone: string;
  catchPerTrip: number;
  trend: Trend;
}

interface Props {
  running: boolean;
  run: JudgeRun | null;
  playerView: ZoneView[];
  live: StockPoint | null;
  // Live harbour seed: the input prefills with it, not an opaque word.
  harbourSeed?: string;
  onRun: (days: number, seed: string) => void;
}

const RUN_KEY = 'tidewater-judges-run-v1';
const SEED_KEY = 'tidewater-judges-seed-v1';
const LEGACY_DEFAULT_SEED = 'judges-1';

export function loadJudgeRun(): JudgeRun | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as JudgeRun;
  } catch {
    return null;
  }
}

export function saveJudgeRun(run: JudgeRun | null): void {
  try {
    if (run === null) localStorage.removeItem(RUN_KEY);
    else localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    // Storage full or blocked: the audit view just resets on reload.
  }
}

function loadSeed(harbourSeed: string | undefined): string {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(SEED_KEY);
  } catch {
    stored = null;
  }
  // A stored custom seed wins; the legacy opaque default yields to
  // the live harbour seed whenever one is known.
  if (stored !== null && stored !== '' && (stored !== LEGACY_DEFAULT_SEED || harbourSeed === undefined)) {
    return stored;
  }
  return harbourSeed ?? LEGACY_DEFAULT_SEED;
}

function stockKeyOf(zone: string): keyof Pick<StockPoint, 'shallows' | 'greybank' | 'deeps'> {
  const z = zone.toLowerCase();
  if (z.includes('grey')) return 'greybank';
  if (z.includes('deep')) return 'deeps';
  return 'shallows';
}

function TrendWord({ trend }: { trend: Trend }) {
  return <span className={`trend trend-${trend}`}>{trend}</span>;
}

function TruthTable({ playerView, last }: { playerView: ZoneView[]; last: StockPoint | null }) {
  return (
    <table className="judges-truth" data-testid="judges-truth">
      <thead>
        <tr>
          <th>Zone</th>
          <th>Your catch per trip</th>
          <th>Real stock</th>
        </tr>
      </thead>
      <tbody>
        {playerView.map((z) => (
          <tr key={z.zone}>
            <td>{z.zone}</td>
            <td>
              {z.catchPerTrip} (<TrendWord trend={z.trend} />)
            </td>
            <td>{last === null ? '—' : Math.round(last[stockKeyOf(z.zone)])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ActorsTable({ actors }: { actors: ActorStanding[] }) {
  return (
    <table className="judges-actors" data-testid="judges-actors">
      <thead>
        <tr>
          <th>Actor</th>
          <th>Gold</th>
          <th>Licences</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {actors.map((a) => (
          <tr key={a.id}>
            <td>{a.name}</td>
            <td>{fmtGold(a.gold)}</td>
            <td>{a.licences}</td>
            <td>{a.stopped ? 'Stopped' : 'Active'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SeedRow({ seed, running, harbourSeed, onSeed, onRun }: {
  seed: string;
  running: boolean;
  harbourSeed: string | undefined;
  onSeed: (value: string) => void;
  onRun: (days: number, seed: string) => void;
}) {
  function start(days: number): void {
    const clean = seed.trim() === '' ? (harbourSeed ?? LEGACY_DEFAULT_SEED) : seed.trim();
    try {
      localStorage.setItem(SEED_KEY, clean);
    } catch {
      // Non-critical: the seed input just resets on reload.
    }
    onRun(days, clean);
  }
  return (
    <div className="run-row">
      <label>
        Seed
        <input value={seed} onChange={(e) => onSeed(e.target.value)} maxLength={64} data-testid="judges-seed" />
      </label>
      <button onClick={() => start(7)} disabled={running} type="button" data-testid="ff-7">
        {running ? 'Simulating…' : 'Fast-forward 7 days'}
      </button>
      <button onClick={() => start(28)} disabled={running} type="button" data-testid="ff-28">
        {running ? 'Simulating…' : 'Fast-forward 28 days'}
      </button>
    </div>
  );
}

function RunSummary({ shown }: { shown: JudgeRun }) {
  return (
    <>
      <p className="muted" data-testid="judges-summary">
        Seed {shown.seed} · {shown.days} days · {shown.events.length} event(s)
      </p>
      <p className="muted" data-testid="judges-signature">
        Deterministic replay signature: {shown.hash}
      </p>
    </>
  );
}

function PortFundRow({ fund }: { fund: PortFund | undefined }) {
  const money = (cents: number | undefined): string => (cents === undefined ? '—' : fmtGold(cents));
  return (
    <p className="muted" data-testid="judges-fund">
      Port fund · balance {money(fund?.balance)} · in {money(fund?.paid_in)} · out {money(fund?.paid_out)}
    </p>
  );
}

function RunCurves({ shown, live }: { shown: JudgeRun; live: StockPoint | null }) {
  return (
    <>
      <h4>Run curves</h4>
      <Chart history={shown.history} events={shown.events} live={live} />
      <p className="muted" data-testid="judges-gold">
        Live gold in port: {fmtGold(shown.goldTotal)} · outside in: {fmtGold(shown.outsideIn)} · outside out: {fmtGold(shown.outsideOut)} ·
        net {fmtGold(shown.outsideIn - shown.outsideOut)}
      </p>
      <PortFundRow fund={shown.fund} />
      <h4>Live standings</h4>
      <ActorsTable actors={shown.actors} />
    </>
  );
}

export default function JudgesPanel({ running, run, playerView, live, harbourSeed, onRun }: Props) {
  const [seed, setSeed] = useState(() => loadSeed(harbourSeed));
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<JudgeRun | null>(loadJudgeRun);

  useEffect(() => {
    if (run !== null) {
      saveJudgeRun(run);
      setSaved(run);
    }
  }, [run]);

  // The harbour seed arrives after first paint; follow it until the
  // player types their own.
  useEffect(() => {
    if (!dirty && harbourSeed !== undefined) setSeed(loadSeed(harbourSeed));
  }, [harbourSeed, dirty]);

  const shown = run ?? saved;
  const last = shown !== null && shown.history.length > 0 ? shown.history[shown.history.length - 1] : null;

  return (
    <div className="judges">
      <h3 className="judges-title">Judges bench</h3>
      <SeedRow seed={seed} running={running} harbourSeed={harbourSeed} onSeed={(value) => { setDirty(true); setSeed(value); }} onRun={onRun} />
      {shown !== null && <RunSummary shown={shown} />}
      {shown === null ? (
        <p className="muted">No simulation yet. Judges run the harbour forward to audit the shared stock.</p>
      ) : (
        <RunCurves shown={shown} live={live} />
      )}
      {playerView.length > 0 && <TruthTable playerView={playerView} last={live ?? last} />}
    </div>
  );
}
