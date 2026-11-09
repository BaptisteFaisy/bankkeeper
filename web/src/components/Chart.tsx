// House canvas chart for the judges audit: real stock per zone plus
// the herring price, with bankruptcy markers overlaid. Static draw
// (no animation), device pixels capped at 2x. Tidewater palette.
import { useEffect, useMemo, useRef, useState } from 'react';

export interface StockPoint {
  day: number;
  shallows: number;
  greybank: number;
  deeps: number;
  herringPrice: number;
}

export interface JudgeEvent {
  day: number;
  kind: string;
  detail: string;
}

interface Props {
  history: StockPoint[];
  events: JudgeEvent[];
  live: StockPoint | null;
}

type SeriesKey = 'shallows' | 'greybank' | 'deeps' | 'herringPrice';

const SERIES: Array<{ key: SeriesKey; label: string; color: string; dashed: boolean }> = [
  { key: 'shallows', label: 'The Shallows stock (crates)', color: '#8fc06f', dashed: false },
  { key: 'greybank', label: 'Greybank stock (crates)', color: '#c9b083', dashed: false },
  { key: 'deeps', label: 'The Deeps stock (crates)', color: '#e4ede6', dashed: false },
  { key: 'herringPrice', label: 'Herring price (gold)', color: '#e0672f', dashed: true },
];

const CW = 720;
const CH = 260;
const PAD = 40;
const BG = '#0f2a30';
const GRID = '#1b4a54';
const INK = '#e4ede6';
const MARK = '#d4705e';

interface Bounds {
  minD: number;
  maxD: number;
  minS: number;
  maxS: number;
  minP: number;
  maxP: number;
}

function widen(lo: number, hi: number): [number, number] {
  if (!Number.isFinite(lo)) return [0, 1];
  if (lo === hi) return [lo, lo + 1];
  return [lo, hi];
}

function boundsOf(points: StockPoint[]): Bounds {
  let minD = Infinity;
  let maxD = -Infinity;
  let minS = Infinity;
  let maxS = -Infinity;
  let minP = Infinity;
  let maxP = -Infinity;
  for (const p of points) {
    minD = Math.min(minD, p.day);
    maxD = Math.max(maxD, p.day);
    minS = Math.min(minS, p.shallows, p.greybank, p.deeps);
    maxS = Math.max(maxS, p.shallows, p.greybank, p.deeps);
    minP = Math.min(minP, p.herringPrice);
    maxP = Math.max(maxP, p.herringPrice);
  }
  const [d0, d1] = widen(minD, maxD);
  const [s0, s1] = widen(minS, maxS);
  const [p0, p1] = widen(minP, maxP);
  return { minD: d0, maxD: d1, minS: s0, maxS: s1, minP: p0, maxP: p1 };
}

interface Scales {
  x: (d: number) => number;
  yStock: (v: number) => number;
  yPrice: (v: number) => number;
}

function makeScales(b: Bounds): Scales {
  const x = (d: number): number => PAD + ((d - b.minD) / (b.maxD - b.minD)) * (CW - PAD * 2);
  const yStock = (v: number): number =>
    CH - PAD - ((v - b.minS) / (b.maxS - b.minS)) * (CH - PAD * 2);
  const yPrice = (v: number): number =>
    CH - PAD - ((v - b.minP) / (b.maxP - b.minP)) * (CH - PAD * 2);
  return { x, yStock, yPrice };
}

function drawFrame(ctx: CanvasRenderingContext2D, b: Bounds): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CW, CH);
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g += 1) {
    const gy = PAD + ((CH - PAD * 2) * g) / 4;
    ctx.beginPath();
    ctx.moveTo(PAD, gy);
    ctx.lineTo(CW - PAD, gy);
    ctx.stroke();
  }
  ctx.fillStyle = INK;
  ctx.font = '11px sans-serif';
  ctx.fillText(String(Math.round(b.maxS)), 4, PAD + 4);
  ctx.fillText(String(Math.round(b.minS)), 4, CH - PAD + 4);
  ctx.fillText(`day ${b.minD}`, PAD, CH - 10);
  ctx.fillText(`day ${b.maxD}`, CW - PAD - 44, CH - 10);
  ctx.fillStyle = '#e0672f';
  ctx.fillText(b.maxP.toFixed(1), CW - PAD + 4, PAD + 4);
  ctx.fillText(b.minP.toFixed(1), CW - PAD + 4, CH - PAD + 4);
}

function drawEvents(ctx: CanvasRenderingContext2D, events: JudgeEvent[], b: Bounds, x: (d: number) => number): void {
  for (const ev of events) {
    if (ev.day < b.minD || ev.day > b.maxD) continue;
    ctx.strokeStyle = MARK;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x(ev.day), PAD - 8);
    ctx.lineTo(x(ev.day), CH - PAD);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = MARK;
    ctx.beginPath();
    ctx.arc(x(ev.day), PAD - 10, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSeries(ctx: CanvasRenderingContext2D, points: StockPoint[], s: Scales, visible: SeriesKey[]): void {
  for (const def of SERIES) {
    if (!visible.includes(def.key)) continue;
    const y = def.key === 'herringPrice' ? s.yPrice : s.yStock;
    ctx.strokeStyle = def.color;
    ctx.lineWidth = 2;
    ctx.setLineDash(def.dashed ? [6, 3] : []);
    ctx.beginPath();
    points.forEach((p, i) => {
      const px = s.x(p.day);
      const py = y(p[def.key]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawChart(ctx: CanvasRenderingContext2D, points: StockPoint[], events: JudgeEvent[], visible: SeriesKey[]): void {
  const b = boundsOf(points);
  drawFrame(ctx, b);
  const s = makeScales(b);
  drawEvents(ctx, events, b, s.x);
  drawSeries(ctx, points, s, visible);
}

function withLive(history: StockPoint[], live: StockPoint | null): StockPoint[] {
  if (live === null) return history;
  const last = history.length > 0 ? history[history.length - 1].day : -1;
  if (live.day <= last) return history;
  return [...history, live];
}

export default function Chart({ history, events, live }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const points = useMemo(() => withLive(history, live), [history, live]);
  const visible = useMemo(() => SERIES.map((s) => s.key).filter((k) => !hidden[k]), [hidden]);

  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawChart(ctx, points, events, visible);
  }, [points, events, visible]);

  function toggle(key: SeriesKey): void {
    setHidden((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (points.length === 0) {
    return <p className="muted">No stock data yet — run a fast-forward below.</p>;
  }
  const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
  return (
    <div className="chart-wrap">
      <canvas
        ref={ref}
        width={CW * dpr}
        height={CH * dpr}
        style={{ width: CW, height: CH }}
        className="chart-canvas"
        data-testid="judges-graph"
        role="img"
        aria-label={`Real stock per zone and herring price, day ${points[0].day} to ${points[points.length - 1].day}`}
      />
      <div className="chart-legend">
        {SERIES.map((s) => (
          <label key={s.key}>
            <input type="checkbox" checked={!hidden[s.key]} onChange={() => toggle(s.key)} />
            <span className="swatch" style={{ background: s.color }} />
            {s.label}
          </label>
        ))}
      </div>
      {events.length > 0 && <p className="muted">Dashed markers flag {events.length} event(s), bankruptcies included.</p>}
    </div>
  );
}
