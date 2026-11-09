// Judges bench: fast-forward the harbour 7 or 28 days with no player,
// then audit the run. Shows the graph (real stock, herring price,
// bankruptcies), every actor gold plus licences, the gold total with
// cumulative outside flows, and the seed. The truth table sets the
// real stock next to what the player sees. The last run persists
// across reloads. No animation anywhere.
import { useEffect, useState } from 'react';
import Chart from './Chart';
import type { JudgeEvent, StockPoint } from './Chart';

export interface ActorStanding {
  id: string;
  name: string;
  gold: number;
  licences: number;
  stopped: boolean;
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
  onRun: (days: number, seed: string) => void;
}

const RUN_KEY = 'tidewater-judges-run-v1';
const SEED_KEY = 'tidewater-judges-seed-v1';

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

function loadSeed(): string {
  try {
    return localStorage.getItem(SEED_KEY) ?? 'judges-1';
  } catch {
    return 'judges-1';
  }
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
            <td>{a.gold}</td>
            <td>{a.licences}</td>
            <td>{a.stopped ? 'Stopped' : 'Active'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function JudgesPanel({ running, run, playerView, live, onRun }: Props) {
  const [seed, setSeed] = useState(loadSeed);
  const [saved, setSaved] = useState<JudgeRun | null>(loadJudgeRun);

  useEffect(() => {
    if (run !== null) {
      saveJudgeRun(run);
      setSaved(run);
    }
  }, [run]);

  function start(days: number): void {
    const clean = seed.trim() === '' ? 'judges-1' : seed.trim();
    try {
      localStorage.setItem(SEED_KEY, clean);
    } catch {
      // Non-critical: the seed input just resets on reload.
    }
    onRun(days, clean);
  }

  const shown = run ?? saved;
  const last = shown !== null && shown.history.length > 0 ? shown.history[shown.history.length - 1] : null;

  return (
    <div className="judges">
      <h3 className="judges-title">Judges bench</h3>
      <div className="run-row">
        <label>
          Seed
          <input value={seed} onChange={(e) => setSeed(e.target.value)} maxLength={64} data-testid="judges-seed" />
        </label>
        <button onClick={() => start(7)} disabled={running} type="button" data-testid="ff-7">
          {running ? 'Simulating…' : 'Fast-forward 7 days'}
        </button>
        <button onClick={() => start(28)} disabled={running} type="button" data-testid="ff-28">
          {running ? 'Simulating…' : 'Fast-forward 28 days'}
        </button>
      </div>
      {shown && (
        <p className="muted" data-testid="judges-summary">
          Seed {shown.seed} · {shown.days} days · hash {shown.hash.slice(0, 12)} · {shown.events.length} event(s)
        </p>
      )}
      {shown === null ? (
        <p className="muted">No simulation yet. Judges run the harbour forward to audit the shared stock.</p>
      ) : (
        <>
          <h4>Run curves</h4>
          <Chart history={shown.history} events={shown.events} live={live} />
          <p className="muted" data-testid="judges-gold">
            Live gold in port: {shown.goldTotal} · outside in: {shown.outsideIn} · outside out: {shown.outsideOut} ·
            net {shown.outsideIn - shown.outsideOut}
          </p>
          <h4>Live standings</h4>
          <ActorsTable actors={shown.actors} />
        </>
      )}
      {playerView.length > 0 && <TruthTable playerView={playerView} last={live ?? last} />}
    </div>
  );
}
