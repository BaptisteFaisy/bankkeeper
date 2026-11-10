// Top-down sea chart on a house canvas: sand coast, harbour, three
// zones, boats at sea colored per captain. Picking is click-to-pick:
// a boat, then a zone or the quay. Honors prefers-reduced-motion
// (one still frame, repaint on state change, no splash or sailing
// tween) and caps DPR at 2.
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { BoatView, BuyerView, CaptainView, ZoneId, ZoneView } from '../types';
import { ZONE_LABEL } from '../types';

interface Props {
  zones: ZoneView[]; boats: BoatView[]; buyers: BuyerView[]; captains: CaptainView[];
  selectedBoat: string | null; onPickBoat: (id: string) => void;
  onPickZone: (zone: ZoneId) => void; onPickQuay: () => void;
}
interface Rect { x: number; y: number; w: number; h: number }
interface Pt { x: number; y: number }
interface BoatSpot { boat: BoatView; x: number; y: number }
interface Splash { x: number; y: number; t0: number }
interface Sail { fromX: number; fromY: number; toX: number; toY: number; t0: number }
interface Fx { splashes: Splash[]; shown: Map<string, Pt>; sails: Map<string, Sail>; sailing: Set<string> }
type CanvasRef = { current: HTMLCanvasElement | null };
type PropsRef = { current: Props };

// Palette: deep greens, sand, foam, buoy orange, plus darker or
// lighter shades of those hues only. No gradients, no glass.
const W = 760, H = 440;
const SEA_A = '#1b4a54', SEA_DK = '#0f2a30', COAST = '#c9b083', SAND_LT = '#e0cf9e';
const SAND_DK = '#8a764f', SAND_DKR = '#6d5b3a', QUAY_DECK = '#b39a68', INK = '#e4ede6';
const MUTED = '#9db5ac', PLAYER = '#e0672f', FALLING = '#c05a28', RISING = '#7f9b9d';
const DISARMED = '#47616b', BUOY_DK = '#a34a1d', COAST_INK = '#4d4231';
const ZONE_RECTS: Record<ZoneId, Rect> = {
  shallows: { x: 168, y: 16, w: 576, h: 128 }, greybank: { x: 168, y: 156, w: 576, h: 136 },
  deeps: { x: 168, y: 304, w: 576, h: 120 } };
const QUAY: Rect = { x: 24, y: 296, w: 112, h: 120 };
const ZONE_IDS: ZoneId[] = ['shallows', 'greybank', 'deeps'];
// Per-zone water identity: light shallows, grey-green bank, dark deeps.
const ZONE_TINT: Record<ZoneId, string> = {
  shallows: 'rgba(96, 165, 172, 0.38)', greybank: 'rgba(120, 145, 135, 0.38)',
  deeps: 'rgba(8, 30, 36, 0.60)' };

function zoneAt(p: Pt): ZoneId | null {
  return ZONE_IDS.find((id) => {
    const r = ZONE_RECTS[id];
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }) ?? null;
}
function inQuay(p: Pt): boolean {
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
      spots.push({ boat, x: QUAY.x + 32 + (quaySlot % 2) * 52, y: QUAY.y + 30 + Math.floor(quaySlot / 2) * 34 });
      quaySlot += 1;
      continue;
    }
    const r = ZONE_RECTS[boat.zone];
    const n = perZone.get(boat.zone) ?? 0;
    perZone.set(boat.zone, n + 1);
    spots.push({ boat, x: r.x + 180 + (n % 5) * 64, y: r.y + 44 + Math.floor(n / 5) * 46 });
  }
  return spots;
}
function captainColors(captains: CaptainView[]): Map<string, string> {
  const colors = new Map<string, string>();
  for (const c of captains) { colors.set(c.id, c.color); colors.set(c.name, c.color); }
  return colors;
}
function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Deterministic sea grain: fixed dot field per zone, computed once at
// load, never re-rolled per frame.
function hash01(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5;
  return s - Math.floor(s);
}
const GRAIN: Pt[] = (() => {
  const dots: Pt[] = [];
  ZONE_IDS.forEach((id, zi) => {
    const r = ZONE_RECTS[id];
    for (let i = 0; i < 14; i += 1) {
      dots.push({ x: r.x + 170 + hash01(zi * 100 + i) * (r.w - 184), y: r.y + 10 + hash01(zi * 100 + i + 50) * (r.h - 20) });
    }
  });
  return dots;
})();
function paintGrain(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(228, 237, 230, 0.14)';
  for (const d of GRAIN) ctx.fillRect(d.x, d.y, 2, 2);
}
function paintWater(ctx: CanvasRenderingContext2D, phase: number): void {
  ctx.fillStyle = SEA_A;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(228, 237, 230, 0.10)';
  ctx.lineWidth = 1;
  for (const id of ZONE_IDS) {
    const r = ZONE_RECTS[id];
    for (let row = 0; row < 4; row += 1) {
      const y = r.y + 22 + row * ((r.h - 36) / 3);
      const x0 = r.x + 190 + (row % 2) * 44;
      ctx.beginPath();
      for (let x = x0; x <= r.x + r.w - 16; x += 8) {
        const wob = Math.sin(x / 26 + phase + row * 1.7) * 3;
        if (x === x0) ctx.moveTo(x, y + wob);
        else ctx.lineTo(x, y + wob);
      }
      ctx.stroke();
    }
  }
}
function paintGulls(ctx: CanvasRenderingContext2D, phase: number): void {
  ctx.strokeStyle = 'rgba(228, 237, 230, 0.75)';
  ctx.lineWidth = 2;
  const nests: Pt[] = [{ x: 400, y: 60 }, { x: 560, y: 210 }, { x: 360, y: 350 }];
  nests.forEach((g, i) => {
    const x = g.x + Math.sin(phase * 0.6 + i * 2.1) * 12;
    const y = g.y + Math.cos(phase * 0.4 + i * 1.3) * 7;
    ctx.beginPath();
    ctx.moveTo(x - 7, y); ctx.lineTo(x, y + 4); ctx.lineTo(x + 7, y);
    ctx.stroke();
  });
}

// Coast plus a built quay: plank deck, mooring posts with sagging
// ropes, iron rings. Reads as a harbour with zero boats tied up.
function paintCoast(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = COAST;
  ctx.fillRect(0, 0, 152, H);
  ctx.fillStyle = SEA_A;
  ctx.fillRect(QUAY.x - 8, QUAY.y - 8, QUAY.w + 16, QUAY.h + 16);
  ctx.strokeStyle = SAND_DK;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(152, 0); ctx.lineTo(152, H); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeRect(QUAY.x - 8, QUAY.y - 8, QUAY.w + 16, QUAY.h + 16);
  ctx.fillStyle = QUAY_DECK;
  ctx.fillRect(QUAY.x, QUAY.y, QUAY.w, QUAY.h);
  ctx.strokeStyle = SAND_DK;
  ctx.lineWidth = 1;
  for (let y = QUAY.y + 12; y < QUAY.y + QUAY.h; y += 12) {
    ctx.beginPath(); ctx.moveTo(QUAY.x + 2, y); ctx.lineTo(QUAY.x + QUAY.w - 2, y); ctx.stroke();
  }
  const posts = [QUAY.y + 10, QUAY.y + QUAY.h / 2, QUAY.y + QUAY.h - 10];
  ctx.fillStyle = SAND_DKR;
  posts.forEach((py, i) => {
    ctx.beginPath(); ctx.arc(QUAY.x + 6, py, 4, 0, Math.PI * 2); ctx.fill();
    if (i + 1 < posts.length) {
      ctx.strokeStyle = SAND_DKR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(QUAY.x + 6, py);
      ctx.quadraticCurveTo(QUAY.x - 4, (py + posts[i + 1]) / 2, QUAY.x + 6, posts[i + 1]);
      ctx.stroke();
    }
  });
  ctx.strokeStyle = SEA_DK;
  ctx.lineWidth = 2;
  for (const ry of [QUAY.y + 30, QUAY.y + QUAY.h - 30]) {
    ctx.beginPath(); ctx.arc(QUAY.x + QUAY.w - 18, ry, 5, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = COAST_INK;
  ctx.font = '10px sans-serif';
  ctx.fillText('QUAY', QUAY.x + 4, QUAY.y + QUAY.h - 6);
}

// Fishmonger stall: counter, posts, striped awning in foam/orange.
function paintStall(ctx: CanvasRenderingContext2D, x: number, y: number, open: boolean): void {
  const wall = open ? SAND_DKR : SEA_DK;
  ctx.fillStyle = wall;
  ctx.fillRect(x + 4, y + 22, 48, 18);
  ctx.fillRect(x + 2, y + 8, 3, 14);
  ctx.fillRect(x + 51, y + 8, 3, 14);
  ctx.fillStyle = open ? SAND_LT : SEA_DK;
  ctx.fillRect(x + 4, y + 18, 48, 4);
  for (let i = 0; i < 6; i += 1) {
    ctx.fillStyle = !open ? SEA_DK : i % 2 === 0 ? INK : PLAYER;
    ctx.fillRect(x + i * 9, y, 9, 12);
  }
}
// Cannery: long low shed, chimney, crate stacks; smoke while open.
function paintCannery(ctx: CanvasRenderingContext2D, x: number, y: number, open: boolean): void {
  ctx.fillStyle = open ? SEA_A : SEA_DK;
  ctx.fillRect(x, y + 12, 60, 26);
  ctx.fillStyle = open ? SAND_DK : SEA_DK;
  ctx.fillRect(x + 46, y, 10, 16);
  if (open) {
    ctx.fillStyle = 'rgba(228, 237, 230, 0.55)';
    ctx.beginPath(); ctx.arc(x + 52, y - 8, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = open ? SAND_DK : SEA_DK;
  ctx.fillRect(x + 2, y + 28, 8, 8);
  ctx.fillRect(x + 11, y + 28, 8, 8);
  ctx.fillRect(x + 6, y + 20, 8, 8);
  ctx.fillStyle = open ? SAND_LT : SEA_DK;
  ctx.fillRect(x + 32, y + 20, 10, 10);
}
// Gull inn: tall house, pitched roof, hanging sign by the door.
function paintInn(ctx: CanvasRenderingContext2D, x: number, y: number, open: boolean): void {
  ctx.fillStyle = open ? SAND_LT : SAND_DK;
  ctx.fillRect(x + 6, y + 10, 40, 30);
  ctx.fillStyle = open ? SAND_DKR : SEA_DK;
  ctx.beginPath();
  ctx.moveTo(x + 2, y + 10); ctx.lineTo(x + 26, y - 4); ctx.lineTo(x + 50, y + 10);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = open ? PLAYER : SEA_DK;
  ctx.fillRect(x + 22, y + 24, 10, 16);
  ctx.fillStyle = SAND_DKR;
  ctx.fillRect(x + 48, y + 18, 2, 12);
  ctx.fillStyle = open ? INK : SAND_DK;
  ctx.fillRect(x + 50, y + 22, 12, 9);
}
function paintBuyers(ctx: CanvasRenderingContext2D, buyers: BuyerView[]): void {
  buyers.slice(0, 3).forEach((b, i) => {
    const x = 16 + (i % 2) * 66, y = 44 + Math.floor(i / 2) * 104;
    const key = `${b.id} ${b.name}`.toLowerCase();
    if (key.includes('cann')) paintCannery(ctx, x, y, b.open);
    else if (key.includes('gull') || key.includes('inn')) paintInn(ctx, x, y, b.open);
    else if (key.includes('monger') || key.includes('fish') || i === 0) paintStall(ctx, x, y, b.open);
    else if (i === 1) paintCannery(ctx, x, y, b.open);
    else paintInn(ctx, x, y, b.open);
    ctx.fillStyle = COAST_INK;
    ctx.font = '10px sans-serif';
    ctx.fillText(b.open ? b.name.slice(0, 10) : `${b.name.slice(0, 7)}…`, x, y + 56);
  });
}
function paintSchools(ctx: CanvasRenderingContext2D, zone: ZoneView): void {
  const r = ZONE_RECTS[zone.id];
  const silver = 'rgba(228, 237, 230, 0.55)';
  for (let i = 0; i < zone.schools; i += 1) {
    const x = r.x + r.w - 70 + (i % 2) * 34;
    const y = r.y + r.h - 26 - Math.floor(i / 2) * 26;
    ctx.fillStyle = silver;
    ctx.beginPath();
    ctx.ellipse(x, y, 9, 4, 0, 0, Math.PI * 2);
    ctx.moveTo(x - 9, y); ctx.lineTo(x - 15, y - 5); ctx.lineTo(x - 15, y + 5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = silver;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 1, y - 3); ctx.lineTo(x + 4, y - 8); ctx.stroke();
  }
}
// Shallows marker: reed ticks along the coast edge of the zone.
function paintReeds(ctx: CanvasRenderingContext2D, r: Rect): void {
  ctx.strokeStyle = RISING;
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i += 1) {
    const y = r.y + 18 + i * ((r.h - 36) / 5);
    ctx.beginPath(); ctx.moveTo(r.x + 4, y); ctx.lineTo(r.x + 7, y - 9); ctx.stroke();
  }
}
// Greybank markers: two orange buoys with rope lines down.
function paintBuoys(ctx: CanvasRenderingContext2D, r: Rect): void {
  for (const [bx, by] of [[r.x + 44, r.y + r.h - 32], [r.x + 100, r.y + r.h - 26]]) {
    ctx.strokeStyle = SAND_DK;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx, by + 6); ctx.lineTo(bx, by + 24); ctx.stroke();
    ctx.fillStyle = PLAYER;
    ctx.beginPath(); ctx.arc(bx, by, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = BUOY_DK;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
// Deeps markers: two white depth posts with crossbars.
function paintDepthPosts(ctx: CanvasRenderingContext2D, r: Rect): void {
  ctx.fillStyle = INK;
  for (const px of [r.x + 132, r.x + 162]) {
    const py = r.y + r.h - 30;
    ctx.fillRect(px - 2, py - 14, 4, 30);
    ctx.fillRect(px - 8, py - 6, 16, 3);
  }
}
function paintZoneFrame(ctx: CanvasRenderingContext2D, zone: ZoneView, armed: boolean): void {
  const r = ZONE_RECTS[zone.id];
  ctx.fillStyle = ZONE_TINT[zone.id];
  ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 10); ctx.fill();
  if (zone.id === 'shallows') paintReeds(ctx, r);
  else if (zone.id === 'greybank') paintBuoys(ctx, r);
  else paintDepthPosts(ctx, r);
  ctx.fillStyle = PLAYER;
  ctx.beginPath(); ctx.arc(r.x + r.w - 16, r.y + 16, 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = armed ? PLAYER : 'rgba(228, 237, 230, 0.35)';
  ctx.lineWidth = armed ? 3 : 1;
  if (armed) ctx.setLineDash([8, 5]);
  ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 10); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = INK;
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(ZONE_LABEL[zone.id], r.x + 12, r.y + 22);
  ctx.font = '12px sans-serif';
  const hulls = zone.boats === 1 ? '1 boat' : `${zone.boats} boats`;
  const rows: Array<[string, string, number]> = [
    [MUTED, `${zone.catchPerTrip.toFixed(1)} crates/trip`, 40],
    [zone.trend === 'falling' ? FALLING : zone.trend === 'rising' ? RISING : MUTED, zone.trend, 56],
    [MUTED, `${hulls} · ${zone.tripCost}g/trip`, 72],
  ];
  for (const [c, t, dy] of rows) { ctx.fillStyle = c; ctx.fillText(t, r.x + 12, r.y + dy); }
  if (zone.survey !== null) { ctx.fillStyle = SAND_LT; ctx.fillText(zone.survey, r.x + 12, r.y + 88); }
}
function paintWake(ctx: CanvasRenderingContext2D, sailing: boolean): void {
  ctx.strokeStyle = 'rgba(228, 237, 230, 0.5)';
  ctx.lineWidth = 1;
  const tails: Array<[number, number, number, number]> = sailing
    ? [[-13, -3, -21, -5], [-13, 3, -21, 5], [-13, 0, -27, 0], [-18, -6, -28, -9], [-18, 6, -28, 9]]
    : [[-13, -3, -21, -5], [-13, 3, -21, 5]];
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of tails) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
  ctx.stroke();
}
// Boat: hull with pointed bow, mast, furled-sail triangle, wake astern.
function paintBoat(ctx: CanvasRenderingContext2D, spot: BoatSpot, color: string, selected: boolean, sailing: boolean): void {
  const { boat, x, y } = spot;
  ctx.save();
  ctx.translate(x, y);
  if (boat.disarmed) ctx.rotate(Math.PI / 2);
  if (selected) {
    ctx.strokeStyle = PLAYER;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = boat.disarmed ? DISARMED : color;
  ctx.beginPath();
  ctx.moveTo(-12, -5); ctx.lineTo(7, -6); ctx.lineTo(15, 0); ctx.lineTo(7, 6); ctx.lineTo(-12, 5);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = SEA_DK;
  ctx.lineWidth = 1;
  ctx.stroke();
  if (!boat.disarmed) paintWake(ctx, sailing);
  const rig = boat.disarmed ? SEA_DK : INK;
  ctx.strokeStyle = rig;
  ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, -15); ctx.stroke();
  ctx.fillStyle = rig;
  ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(8, -7); ctx.lineTo(0, -7); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function paintAll(ctx: CanvasRenderingContext2D, props: Props, captains: Map<string, string>, spots: BoatSpot[], fx: Fx, phase: number, now: number): void {
  paintWater(ctx, phase);
  paintGrain(ctx);
  paintCoast(ctx);
  paintBuyers(ctx, props.buyers);
  const armed = props.selectedBoat !== null;
  for (const zone of props.zones) { paintZoneFrame(ctx, zone, armed); paintSchools(ctx, zone); }
  paintGulls(ctx, phase);
  for (const spot of spots) {
    const color = spot.boat.mine ? PLAYER : (captains.get(spot.boat.captain) ?? RISING);
    paintBoat(ctx, spot, color, spot.boat.id === props.selectedBoat, fx.sailing.has(spot.boat.id));
  }
  for (const s of fx.splashes) {
    const age = now - s.t0;
    if (age < 0 || age > 500) continue;
    const k = age / 500;
    ctx.strokeStyle = `rgba(228, 237, 230, ${(0.85 * (1 - k)).toFixed(2)})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, 6 + 24 * k, 0, Math.PI * 2); ctx.stroke();
  }
}

// Sailing tween: boats glide from their last rendered mark to the new
// slot over ~1s. Presentation only; the assign data flow is untouched.
function placeSpots(fx: Fx, spots: BoatSpot[], now: number, still: boolean): BoatSpot[] {
  if (still) {
    fx.sails.clear();
    fx.sailing.clear();
    for (const s of spots) fx.shown.set(s.boat.id, { x: s.x, y: s.y });
    return spots;
  }
  const live = new Set(spots.map((s) => s.boat.id));
  for (const id of fx.shown.keys()) if (!live.has(id)) { fx.shown.delete(id); fx.sails.delete(id); }
  fx.sailing.clear();
  return spots.map((s) => {
    const prev = fx.shown.get(s.boat.id) ?? { x: s.x, y: s.y };
    let sail = fx.sails.get(s.boat.id);
    if (sail !== undefined && (sail.toX !== s.x || sail.toY !== s.y)) sail = undefined;
    if (sail === undefined && Math.hypot(s.x - prev.x, s.y - prev.y) > 1) {
      sail = { fromX: prev.x, fromY: prev.y, toX: s.x, toY: s.y, t0: now };
      fx.sails.set(s.boat.id, sail);
    }
    if (sail === undefined) { fx.shown.set(s.boat.id, { x: s.x, y: s.y }); return s; }
    const k = Math.min(1, (now - sail.t0) / 1000);
    const e = k * (2 - k);
    const at = { x: sail.fromX + (s.x - sail.fromX) * e, y: sail.fromY + (s.y - sail.fromY) * e };
    if (k >= 1) fx.sails.delete(s.boat.id);
    else fx.sailing.add(s.boat.id);
    fx.shown.set(s.boat.id, at);
    return { boat: s.boat, x: at.x, y: at.y };
  });
}
function createFx(): Fx {
  return { splashes: [], shown: new Map(), sails: new Map(), sailing: new Set() };
}
function useAnimatedChart(canvasRef: CanvasRef, propsRef: PropsRef, fx: Fx): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.scale(dpr, dpr);
    const g: CanvasRenderingContext2D = ctx;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let phase = 0;
    function frame(): void {
      const p = propsRef.current;
      const now = performance.now();
      fx.splashes = fx.splashes.filter((s) => now - s.t0 < 600);
      paintAll(g, p, captainColors(p.captains), placeSpots(fx, layoutBoats(p.boats), now, mql.matches), fx, phase, now);
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
}
function useStillRepaint(canvasRef: CanvasRef, fx: Fx, props: Props): void {
  useEffect(() => {
    if (!reducedMotion()) return;
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintAll(ctx, props, captainColors(props.captains), placeSpots(fx, layoutBoats(props.boats), 0, true), fx, 0, 0);
  }, [props]);
}
function handlePick(props: Props, fx: Fx, canvas: HTMLCanvasElement, e: ReactMouseEvent): void {
  const rect = canvas.getBoundingClientRect();
  const p = { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  let best: BoatSpot | null = null;
  let bestDist = 20;
  for (const s of layoutBoats(props.boats)) {
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d < bestDist) { best = s; bestDist = d; }
  }
  if (best !== null) { props.onPickBoat(best.boat.id); return; }
  const zone = zoneAt(p);
  if (zone === null && !inQuay(p)) return;
  if (!reducedMotion()) fx.splashes.push({ x: p.x, y: p.y, t0: performance.now() });
  if (zone !== null) props.onPickZone(zone);
  else props.onPickQuay();
}
export default function SeaMap(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [fx] = useState<Fx>(createFx);
  useAnimatedChart(canvasRef, propsRef, fx);
  useStillRepaint(canvasRef, fx, props);
  return (
    <canvas
      ref={canvasRef}
      className="sea-canvas"
      style={{ width: '100%', height: 'auto', aspectRatio: `${W} / ${H}` }}
      aria-label="Sea chart: coast, harbour, three fishing zones and boats"
      onClick={(e) => {
        const canvas = canvasRef.current;
        if (canvas !== null) handlePick(props, fx, canvas, e);
      }}
    />
  );
}
