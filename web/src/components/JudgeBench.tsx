// The judges bench drawer: seed, fast-forward runs and the live point.
//
// Split out of App.tsx so the app file stays about the screen, and the
// bench about the bench. The DOM is unchanged: `section[aria-label='Judges']`
// with `id="judges-bench"`, the copy link and the JudgesPanel inside.
import type { FFResponse, GraphLive, JudgesLive, PortState } from '../types';
import { ZONE_LABEL } from '../types';
import type { GameState } from '../hooks';
import { doRunFF } from '../actions';
import { CopyLink } from './HeaderControls';
import JudgesPanel from './JudgesPanel';
import type { JudgeRun } from './JudgesPanel';
import type { StockPoint } from './Chart';

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

export default function JudgeBench({ game, port, judges, graph }: { game: GameState; port: PortState | null; judges: JudgesLive | null; graph: GraphLive | null }) {
  const seed = port?.seed ?? 'tidewater';
  const seasonDays = port?.seasonDays ?? 28;
  const run = game.ff === null ? null : ffToRun(game.ff, judges);
  const playerView = (port?.zones ?? []).map((z) => ({ zone: ZONE_LABEL[z.id], catchPerTrip: z.catchPerTrip, trend: z.trend }));
  return (
    <section className="panel judges" id="judges-bench" aria-label="Judges">
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
