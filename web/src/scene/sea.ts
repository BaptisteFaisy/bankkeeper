// sea.ts — the water, the coast and the life of each zone.
//
// Two slow sheets of waves, a tide line along the shore, one tint per
// zone (the tint follows the density of the stock) and the fish
// themselves: the fewer crates a zone holds, the fewer fish show.

import { alpha, alphaHex, color, tone } from './palette';
import {
  CHEST_MARK, COAST_X, FISH_SPOTS, MAP_H, MAP_W, QUAY, STALL_MARKS,
  ZONE_KEYS, ZONE_LABEL, ZONE_RECTS, type Pt, type Rect, type ZoneKey,
} from './layout';
import {
  ANCHOR_ANCHOR, CHEST_ANCHOR, FISH_ANCHOR, STALL_ANCHOR, anchorSprite, blit,
  chestSprite, fishSprite, stallSprite, type StallKind,
} from './sprites';

export interface SeaZone { id: ZoneKey; stock: number; debt: boolean }
export interface SeaStall { name: string; kind: StallKind }

export interface SeaView {
  zones: SeaZone[];
  stalls: SeaStall[];
  litStall: number;
  fundLevel: number;
  chestOpen: boolean;
}

interface WaveRow { y: number; x0: number; x1: number; row: number }

const WAVE_ROWS: WaveRow[] = buildWaveRows();

function buildWaveRows(): WaveRow[] {
  const rows: WaveRow[] = [];
  ZONE_KEYS.forEach((id) => {
    const r = ZONE_RECTS[id];
    for (let row = 0; row < 4; row += 1) {
      rows.push({
        y: r.y + 22 + row * ((r.h - 36) / 3),
        x0: r.x + 190 + (row % 2) * 44,
        x1: r.x + r.w - 16,
        row,
      });
    }
  });
  return rows;
}

/** The water: a flat base and two sheets of slow waves. */
export function drawWater(ctx: CanvasRenderingContext2D, phase: number): void {
  ctx.fillStyle = color('--panel-2');
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  drawWaveSheet(ctx, phase, 3, alpha('--ink', 0.12));
  drawWaveSheet(ctx, phase * 0.62 + 2.4, 2, alpha('--ink', 0.08));
}

function drawWaveSheet(
  ctx: CanvasRenderingContext2D,
  phase: number,
  amplitude: number,
  ink: string,
): void {
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;
  for (const r of WAVE_ROWS) {
    ctx.beginPath();
    for (let x = r.x0; x <= r.x1; x += 8) {
      const wob = Math.sin(x / 26 + phase + r.row * 1.7) * amplitude;
      if (x === r.x0) ctx.moveTo(x, r.y + wob);
      else ctx.lineTo(x, r.y + wob);
    }
    ctx.stroke();
  }
}

/** One tint per zone: the richer the stock, the clearer the water. */
export function drawZoneTints(ctx: CanvasRenderingContext2D, zones: SeaZone[]): void {
  for (let i = 0; i < zones.length; i += 1) {
    const zone = zones[i];
    const r = ZONE_RECTS[zone.id];
    ctx.fillStyle = zoneTint(zone);
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 10);
    ctx.fill();
    if (zone.debt) {
      ctx.fillStyle = alphaHex(tone('--muted', -0.45), 0.34);
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 10);
      ctx.fill();
    }
  }
}

function zoneTint(zone: SeaZone): string {
  const stock = Math.max(0, Math.min(1, zone.stock));
  if (zone.id === 'shallows') return alphaHex(tone('--sea', 0.28), 0.16 + 0.22 * stock);
  if (zone.id === 'greybank') return alphaHex(tone('--muted', -0.1), 0.10 + 0.16 * stock);
  return alphaHex(tone('--sea', -0.45), 0.34 + 0.2 * stock);
}

/** Fish: they thin out as the zone empties. */
export function drawFish(ctx: CanvasRenderingContext2D, zones: SeaZone[], phase: number): void {
  const img = fishSprite();
  for (let z = 0; z < zones.length; z += 1) {
    const zone = zones[z];
    const spots = FISH_SPOTS[zone.id];
    const count = Math.round(Math.max(0, Math.min(1, zone.stock)) * spots.length);
    for (let i = 0; i < count; i += 1) {
      const p = spots[i];
      const x = p.x + Math.sin(phase * 0.5 + i) * 5;
      const y = p.y + Math.cos(phase * 0.35 + i * 1.7) * 2;
      blit(ctx, img, FISH_ANCHOR, x, y);
    }
  }
}

/** The sand strip and the line of tide that marks the shore. */
export function drawCoast(ctx: CanvasRenderingContext2D, phase: number): void {
  ctx.fillStyle = tone('--sand', -0.05);
  ctx.fillRect(0, 0, COAST_X, MAP_H);
  ctx.strokeStyle = alphaHex(tone('--sand', -0.45), 0.9);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(COAST_X, 0);
  ctx.lineTo(COAST_X, MAP_H);
  ctx.stroke();
  ctx.strokeStyle = alpha('--ink', 0.35);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let y = 0; y <= MAP_H; y += 6) {
    const x = COAST_X + 4 + Math.sin(y / 30 + phase * 0.4) * 3;
    if (y === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** The built quay: deck, planks, mooring posts, rings, harbour chest. */
export function drawQuay(ctx: CanvasRenderingContext2D, fundLevel: number, chestOpen: boolean): void {
  ctx.fillStyle = color('--panel-2');
  ctx.fillRect(QUAY.x - 8, QUAY.y - 8, QUAY.w + 16, QUAY.h + 16);
  ctx.strokeStyle = tone('--sand', -0.45);
  ctx.lineWidth = 2;
  ctx.strokeRect(QUAY.x - 8, QUAY.y - 8, QUAY.w + 16, QUAY.h + 16);
  ctx.fillStyle = tone('--sand', -0.18);
  ctx.fillRect(QUAY.x, QUAY.y, QUAY.w, QUAY.h);
  ctx.strokeStyle = alphaHex(tone('--sand', -0.4), 0.8);
  ctx.lineWidth = 1;
  for (let y = QUAY.y + 12; y < QUAY.y + QUAY.h; y += 12) {
    ctx.beginPath();
    ctx.moveTo(QUAY.x + 2, y);
    ctx.lineTo(QUAY.x + QUAY.w - 2, y);
    ctx.stroke();
  }
  drawMooring(ctx);
  drawChest(ctx, fundLevel, chestOpen);
}

function drawMooring(ctx: CanvasRenderingContext2D): void {
  const posts = [QUAY.y + 10, QUAY.y + QUAY.h / 2, QUAY.y + QUAY.h - 10];
  ctx.fillStyle = tone('--sand', -0.5);
  posts.forEach((py, i) => {
    ctx.beginPath();
    ctx.arc(QUAY.x + 6, py, 4, 0, Math.PI * 2);
    ctx.fill();
    if (i + 1 < posts.length) {
      ctx.strokeStyle = tone('--sand', -0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(QUAY.x + 6, py);
      ctx.quadraticCurveTo(QUAY.x - 4, (py + posts[i + 1]) / 2, QUAY.x + 6, posts[i + 1]);
      ctx.stroke();
    }
  });
  ctx.strokeStyle = tone('--bg', 0.1);
  ctx.lineWidth = 2;
  for (const ry of [QUAY.y + 30, QUAY.y + QUAY.h - 30]) {
    ctx.beginPath();
    ctx.arc(QUAY.x + QUAY.w - 18, ry, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = tone('--sand', -0.6);
  ctx.font = '10px sans-serif';
  ctx.fillText('QUAY', QUAY.x + 4, QUAY.y + QUAY.h - 6);
}

function drawChest(ctx: CanvasRenderingContext2D, fundLevel: number, chestOpen: boolean): void {
  const x = CHEST_MARK.x;
  const y = CHEST_MARK.y;
  blit(ctx, chestSprite(chestOpen), CHEST_ANCHOR, x, y);
  const level = Math.max(0, Math.min(1, fundLevel));
  if (level > 0.02) {
    ctx.fillStyle = alpha('--gold', 0.85);
    ctx.fillRect(x - 14, y + 4, 28, 10 * level);
  }
}

/** The three merchants on the coast; the buyer lights up. */
export function drawStalls(ctx: CanvasRenderingContext2D, stalls: SeaStall[], litStall: number): void {
  for (let i = 0; i < stalls.length && i < STALL_MARKS.length; i += 1) {
    const mark = STALL_MARKS[i];
    const lit = i === litStall;
    blit(ctx, stallSprite(stalls[i].kind, lit), STALL_ANCHOR, mark.x + 32, mark.y + 24);
    ctx.fillStyle = lit ? color('--gold') : alpha('--ink', 0.8);
    ctx.font = '10px sans-serif';
    ctx.fillText(stalls[i].name.slice(0, 10), mark.x, mark.y + 58);
  }
}

/** The name of each zone, in small, and how rich it still is. */
export function drawZoneLabels(ctx: CanvasRenderingContext2D, zones: SeaZone[]): void {
  for (let i = 0; i < zones.length; i += 1) {
    const zone = zones[i];
    const r = ZONE_RECTS[zone.id];
    ctx.fillStyle = alpha('--ink', 0.85);
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(ZONE_LABEL[zone.id], r.x + 12, r.y + 22);
    drawStockBar(ctx, r, zone);
    if (zone.debt) {
      blit(ctx, anchorSprite(), ANCHOR_ANCHOR, r.x + r.w - 22, r.y + r.h - 24);
    }
  }
}

function drawStockBar(ctx: CanvasRenderingContext2D, r: Rect, zone: SeaZone): void {
  const w = 46;
  const x = r.x + r.w - w - 14;
  const y = r.y + 16;
  ctx.fillStyle = alpha('--ink', 0.18);
  ctx.fillRect(x, y, w, 4);
  ctx.fillStyle = alpha('--kelp', 0.85);
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, zone.stock)), 4);
}

/** Gulls circling over the chart: the ones that follow the catch. */
export function drawGulls(ctx: CanvasRenderingContext2D, nests: Pt[], phase: number): void {
  ctx.strokeStyle = alpha('--ink', 0.75);
  ctx.lineWidth = 2;
  for (let i = 0; i < nests.length; i += 1) {
    const g = nests[i];
    const x = g.x + Math.sin(phase * 0.6 + i * 2.1) * 12;
    const y = g.y + Math.cos(phase * 0.4 + i * 1.3) * 7;
    ctx.beginPath();
    ctx.moveTo(x - 7, y);
    ctx.lineTo(x, y + 4);
    ctx.lineTo(x + 7, y);
    ctx.stroke();
  }
}
