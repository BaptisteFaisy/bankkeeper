// Top-down sea chart on a house canvas: sand coast, harbour, three
// zones, boats at sea colored per captain. Picking is click-to-pick:
// a boat, then a zone or the quay. Honors prefers-reduced-motion
// (still water, paint on state change only) and caps DPR at 2.
import { useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { BoatView, BuyerView, CaptainView, ZoneId, ZoneView } from '../types';
import { ZONE_LABEL } from '../types';

interface Props {
  zones: ZoneView[];
  boats: BoatView[];
  buyers: BuyerView[];
  captains: CaptainView[];
  selectedBoat: string | null;
  onPickBoat: (id: string) => void;
  onPickZone: (zone: ZoneId) => void;
  onPickQuay: () => void;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface BoatSpot {
  boat: BoatView;
  x: number;
  y: number;
}

const W = 760;
const H = 440;
const SEA_A = '#1b4a54';
// Zone wash: #24616c at 35% alpha, as an rgba literal below.
const COAST = '#c9b083';
const INK = '#e4ede6';
const MUTED = '#9db5ac';
const PLAYER = '#e0672f';
const FALLING = '#d4705e';
const RISING = '#8fc06f';

const ZONE_RECTS: Record<ZoneId, Rect> = {
  shallows: { x: 168, y: 16, w: 576, h: 128 },
  greybank: { x: 168, y: 156, w: 576, h: 136 },
  deeps: { x: 168, y: 304, w: 576, h: 120 },
};

const QUAY: Rect = { x: 24, y: 296, w: 112, h: 120 };

function zoneAt(p: { x: number; y: number }): ZoneId | null {
  const ids: ZoneId[] = ['shallows', 'greybank', 'deeps'];
  for (const id of ids) {
    const r = ZONE_RECTS[id];
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return id;
  }
  return null;
}

function inQuay(p: { x: number; y: number }): boolean {
  return p.x >= QUAY.x && p.x <= QUAY.x + QUAY.w && p.y >= QUAY.y && p.y <= QUAY.y + QUAY.h;
}

// Deterministic slots: the same boats always land on the same marks,
// so paint and click math share one layout.
function layoutBoats(boats: BoatView[]): BoatSpot[] {
  const spots: BoatSpot[] = [];
  const perZone = new Map<ZoneId, number>();
  let quaySlot = 0;
  for (const boat of boats) {
    if (boat.zone === null) {
      const col = quaySlot % 2;
      const row = Math.floor(quaySlot / 2);
      spots.push({ boat, x: QUAY.x + 32 + col * 52, y: QUAY.y + 30 + row * 34 });
      quaySlot += 1;
      continue;
    }
    const r = ZONE_RECTS[boat.zone];
    const n = perZone.get(boat.zone) ?? 0;
    perZone.set(boat.zone, n + 1);
    spots.push({ boat, x: r.x + 210 + (n % 4) * 88, y: r.y + 42 + Math.floor(n / 4) * 52 });
  }
  return spots;
}

function boatColor(boat: BoatView, captains: Map<string, string>): string {
  if (boat.mine) return PLAYER;
  return captains.get(boat.captain) ?? RISING;
}

function captainColors(captains: CaptainView[]): Map<string, string> {
  const colors = new Map<string, string>();
  for (const c of captains) {
    colors.set(c.id, c.color);
    colors.set(c.name, c.color);
  }
  return colors;
}

function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number): void {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
}

function paintWater(ctx: CanvasRenderingContext2D, phase: number): void {
  ctx.fillStyle = SEA_A;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(228, 237, 230, 0.10)';
  ctx.lineWidth = 1;
  for (const id of Object.keys(ZONE_RECTS) as ZoneId[]) {
    const r = ZONE_RECTS[id];
    for (let row = 0; row < 3; row += 1) {
      const y = r.y + 26 + row * ((r.h - 40) / 2);
      ctx.beginPath();
      for (let x = r.x + 190; x <= r.x + r.w - 16; x += 8) {
        const wob = Math.sin(x / 26 + phase + row * 1.7) * 3;
        if (x === r.x + 190) ctx.moveTo(x, y + wob);
        else ctx.lineTo(x, y + wob);
      }
      ctx.stroke();
    }
  }
}

function paintCoast(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = COAST;
  ctx.fillRect(0, 0, 152, H);
  ctx.fillStyle = SEA_A;
  ctx.fillRect(QUAY.x - 8, QUAY.y - 8, QUAY.w + 16, QUAY.h + 16);
  ctx.strokeStyle = '#8a764f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(152, 0);
  ctx.lineTo(152, H);
  ctx.stroke();
  ctx.strokeStyle = '#8a764f';
  ctx.lineWidth = 2;
  ctx.strokeRect(QUAY.x - 8, QUAY.y - 8, QUAY.w + 16, QUAY.h + 16);
  ctx.fillStyle = '#4d4231';
  ctx.font = '12px sans-serif';
  ctx.fillText('QUAY', QUAY.x + 2, QUAY.y + QUAY.h + 14);
}

// Harbour sheds: an open buyer shows lit windows, a closed one goes
// dark. The cannery smokes while open, never when closed.
function paintBuyers(ctx: CanvasRenderingContext2D, buyers: BuyerView[]): void {
  const sheds = buyers.slice(0, 3);
  sheds.forEach((b, i) => {
    const x = 16 + (i % 2) * 66;
    const y = 40 + Math.floor(i / 2) * 96;
    ctx.fillStyle = b.open ? '#5d6e5a' : '#3a4238';
    ctx.fillRect(x, y, 56, 40);
    ctx.fillStyle = b.open ? '#e3b65a' : '#23281f';
    ctx.fillRect(x + 8, y + 12, 12, 12);
    ctx.fillRect(x + 36, y + 12, 12, 12);
    if (b.id === 'cannery' && b.open) {
      ctx.fillStyle = 'rgba(228, 237, 230, 0.5)';
      ctx.beginPath();
      ctx.arc(x + 44, y - 12, 5, 0, Math.PI * 2);
      ctx.arc(x + 50, y - 24, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5d6e5a';
      ctx.fillRect(x + 38, y - 10, 10, 12);
    }
    ctx.fillStyle = '#4d4231';
    ctx.font = '10px sans-serif';
    ctx.fillText(b.open ? b.name.slice(0, 10) : `${b.name.slice(0, 7)}…`, x, y + 54);
  });
}

function trendColor(trend: string): string {
  if (trend === 'falling') return FALLING;
  if (trend === 'rising') return RISING;
  return MUTED;
}

function paintSchools(ctx: CanvasRenderingContext2D, zone: ZoneView): void {
  const r = ZONE_RECTS[zone.id];
  ctx.fillStyle = 'rgba(228, 237, 230, 0.55)';
  for (let i = 0; i < zone.schools; i += 1) {
    const x = r.x + 24 + (i % 2) * 34;
    const y = r.y + r.h - 26 - Math.floor(i / 2) * 26;
    ctx.beginPath();
    ctx.ellipse(x, y, 9, 4, 0, 0, Math.PI * 2);
    ctx.moveTo(x - 9, y);
    ctx.lineTo(x - 15, y - 5);
    ctx.lineTo(x - 15, y + 5);
    ctx.closePath();
    ctx.fill();
  }
}

function paintZoneFrame(ctx: CanvasRenderingContext2D, zone: ZoneView, armed: boolean): void {
  const r = ZONE_RECTS[zone.id];
  ctx.fillStyle = 'rgba(36, 97, 108, 0.35)';
  roundRect(ctx, r, 10);
  ctx.fill();
  ctx.strokeStyle = armed ? PLAYER : 'rgba(228, 237, 230, 0.35)';
  ctx.lineWidth = armed ? 3 : 1;
  if (armed) ctx.setLineDash([8, 5]);
  roundRect(ctx, r, 10);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = INK;
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(ZONE_LABEL[zone.id], r.x + 12, r.y + 22);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = MUTED;
  ctx.fillText(`${zone.catchPerTrip.toFixed(1)} crates/trip`, r.x + 12, r.y + 40);
  ctx.fillStyle = trendColor(zone.trend);
  ctx.fillText(zone.trend, r.x + 12, r.y + 56);
  ctx.fillStyle = MUTED;
  ctx.fillText(`${zone.boats} boats · ${zone.tripCost}g/trip`, r.x + 12, r.y + 72);
  if (zone.survey !== null) {
    ctx.fillStyle = '#e3b65a';
    ctx.fillText(zone.survey, r.x + 12, r.y + 88);
  }
}

function paintBoat(ctx: CanvasRenderingContext2D, spot: BoatSpot, color: string, selected: boolean): void {
  const { boat, x, y } = spot;
  ctx.save();
  ctx.translate(x, y);
  if (boat.disarmed) ctx.rotate(Math.PI / 2);
  if (selected) {
    ctx.strokeStyle = PLAYER;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = boat.disarmed ? '#5a665f' : color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = boat.disarmed ? '#3a4238' : '#0f2a30';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(0, -14);
  ctx.stroke();
  ctx.fillStyle = boat.disarmed ? '#3a4238' : INK;
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(9, -5);
  ctx.lineTo(0, -5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function paintAll(
  ctx: CanvasRenderingContext2D,
  props: Props,
  captains: Map<string, string>,
  spots: BoatSpot[],
  phase: number,
): void {
  paintWater(ctx, phase);
  paintCoast(ctx);
  paintBuyers(ctx, props.buyers);
  const armed = props.selectedBoat !== null;
  for (const zone of props.zones) {
    paintZoneFrame(ctx, zone, armed);
    paintSchools(ctx, zone);
  }
  for (const spot of spots) {
    paintBoat(ctx, spot, boatColor(spot.boat, captains), spot.boat.id === props.selectedBoat);
  }
}

function toCanvas(e: ReactMouseEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * W,
    y: ((e.clientY - rect.top) / rect.height) * H,
  };
}

export default function SeaMap(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.scale(dpr, dpr);
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let phase = 0;
    function frame(): void {
      const p = propsRef.current;
      paintAll(ctx as CanvasRenderingContext2D, p, captainColors(p.captains), layoutBoats(p.boats), phase);
      if (mql.matches) return;
      phase += 0.03;
      raf = window.requestAnimationFrame(frame);
    }
    frame();
    function onMotionChange(): void {
      window.cancelAnimationFrame(raf);
      frame();
    }
    mql.addEventListener('change', onMotionChange);
    return () => {
      window.cancelAnimationFrame(raf);
      mql.removeEventListener('change', onMotionChange);
    };
  }, []);

  // Repaint still frames when state changes under reduced motion.
  useEffect(() => {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintAll(ctx, props, captainColors(props.captains), layoutBoats(props.boats), 0);
  }, [props]);

  function onClick(e: ReactMouseEvent): void {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const p = toCanvas(e, canvas);
    const spots = layoutBoats(props.boats);
    let best: BoatSpot | null = null;
    let bestDist = 20;
    for (const s of spots) {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bestDist) {
        best = s;
        bestDist = d;
      }
    }
    if (best !== null) {
      props.onPickBoat((best as BoatSpot).boat.id);
      return;
    }
    const zone = zoneAt(p);
    if (zone !== null) {
      props.onPickZone(zone);
      return;
    }
    if (inQuay(p)) props.onPickQuay();
  }

  return (
    <canvas
      ref={canvasRef}
      className="sea-canvas"
      style={{ width: '100%', height: 'auto', aspectRatio: `${W} / ${H}` }}
      aria-label="Sea chart: coast, harbour, three fishing zones and boats"
      onClick={onClick}
    />
  );
}
