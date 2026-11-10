// sprites.ts — every shape of the scene, drawn once into an
// off-screen canvas and blitted afterwards.
//
// Nothing is animated inside a sprite: a sprite is a still form
// (hull, crate, stall, chest, gull, anchor, fish). The animation
// lives in the modules that place them.

import { alpha, color, tone } from './palette';

export interface Pt { x: number; y: number }

/** Where a sprite is pinned when it is blitted (its centre). */
export const BOAT_ANCHOR: Pt = { x: 24, y: 26 };
export const CRATE_ANCHOR: Pt = { x: 7, y: 7 };
export const GULL_ANCHOR: Pt = { x: 11, y: 6 };
export const STALL_ANCHOR: Pt = { x: 32, y: 24 };
export const CHEST_ANCHOR: Pt = { x: 19, y: 14 };
export const ANCHOR_ANCHOR: Pt = { x: 10, y: 13 };
export const FISH_ANCHOR: Pt = { x: 11, y: 6 };

export type StallKind = 'monger' | 'cannery' | 'inn';

const cache = new Map<string, HTMLCanvasElement>();

function surface(w: number, h: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('scene: no 2d context available');
  return ctx;
}

function sprite(
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const ctx = surface(w, h);
  draw(ctx);
  const canvas = ctx.canvas;
  cache.set(key, canvas);
  return canvas;
}

/** Blit a sprite so that its anchor lands on (x, y). */
export function blit(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  anchor: Pt,
  x: number,
  y: number,
): void {
  ctx.drawImage(img, Math.round(x - anchor.x), Math.round(y - anchor.y));
}

/** Hull, mast and sail. `rigged` false: a boat with its gear down. */
export function boatSprite(hull: string, rigged: boolean): HTMLCanvasElement {
  return sprite(`boat|${hull}|${rigged}`, 48, 44, (ctx) => {
    const cx = BOAT_ANCHOR.x;
    const cy = BOAT_ANCHOR.y;
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(cx - 13, cy - 5);
    ctx.lineTo(cx + 7, cy - 6);
    ctx.lineTo(cx + 16, cy);
    ctx.lineTo(cx + 7, cy + 6);
    ctx.lineTo(cx - 13, cy + 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color('--bg');
    ctx.lineWidth = 1;
    ctx.stroke();
    const rig = rigged ? color('--ink') : tone('--line', 0.2);
    ctx.strokeStyle = rig;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx, cy - 16);
    ctx.stroke();
    ctx.fillStyle = rig;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 16);
    ctx.lineTo(cx + 9, cy - 7);
    ctx.lineTo(cx, cy - 7);
    ctx.closePath();
    ctx.fill();
  });
}

/** A crate of catch. */
export function crateSprite(): HTMLCanvasElement {
  return sprite('crate', 14, 14, (ctx) => {
    ctx.fillStyle = tone('--sand', -0.15);
    ctx.fillRect(0, 0, 14, 14);
    ctx.strokeStyle = tone('--sand', -0.45);
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, 13, 13);
    ctx.beginPath();
    ctx.moveTo(1, 1);
    ctx.lineTo(13, 13);
    ctx.moveTo(13, 1);
    ctx.lineTo(1, 13);
    ctx.stroke();
  });
}

/** A gull, wings down. */
export function gullSprite(): HTMLCanvasElement {
  return sprite('gull', 22, 12, (ctx) => {
    ctx.strokeStyle = alpha('--ink', 0.85);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(1, 5);
    ctx.lineTo(11, 10);
    ctx.lineTo(21, 5);
    ctx.stroke();
  });
}

/** A shoal of fish: a silhouette, seen from above. */
export function fishSprite(): HTMLCanvasElement {
  return sprite('fish', 22, 12, (ctx) => {
    ctx.fillStyle = alpha('--ink', 0.5);
    ctx.beginPath();
    ctx.ellipse(9, 6, 7, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(3, 6);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(0, 9.5);
    ctx.closePath();
    ctx.fill();
  });
}

/** The harbour chest: shut, or open on a paid motion. */
export function chestSprite(open: boolean): HTMLCanvasElement {
  return sprite(`chest|${open}`, 38, 28, (ctx) => {
    ctx.fillStyle = tone('--sand', -0.35);
    ctx.fillRect(2, 12, 34, 14);
    ctx.strokeStyle = tone('--sand', -0.55);
    ctx.lineWidth = 1;
    ctx.strokeRect(2.5, 12.5, 33, 13);
    ctx.fillStyle = open ? tone('--gold', -0.1) : tone('--sand', -0.1);
    if (open) {
      ctx.beginPath();
      ctx.moveTo(3, 12);
      ctx.lineTo(6, 2);
      ctx.lineTo(33, 2);
      ctx.lineTo(35, 12);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(2, 12);
      ctx.lineTo(6, 4);
      ctx.lineTo(33, 4);
      ctx.lineTo(36, 12);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = open ? color('--gold') : tone('--sand', 0.1);
    ctx.fillRect(16, 10, 6, 7);
  });
}

/** A broken anchor: the debt of a zone, still unpaid. */
export function anchorSprite(): HTMLCanvasElement {
  return sprite('anchor', 20, 26, (ctx) => {
    ctx.strokeStyle = tone('--muted', -0.3);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, 2);
    ctx.lineTo(10, 18);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(10, 4, 2.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(3, 14);
    ctx.quadraticCurveTo(10, 24, 17, 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(12, 16);
    ctx.lineTo(17, 21);
    ctx.stroke();
  });
}

/** A merchant stall: fishmonger, cannery or inn. */
export function stallSprite(kind: StallKind, lit: boolean): HTMLCanvasElement {
  return sprite(`stall|${kind}|${lit}`, 64, 48, (ctx) => {
    if (kind === 'cannery') drawCannery(ctx, lit);
    else if (kind === 'inn') drawInn(ctx, lit);
    else drawMonger(ctx, lit);
  });
}

function drawMonger(ctx: CanvasRenderingContext2D, lit: boolean): void {
  const wall = lit ? tone('--sand', -0.35) : tone('--line', -0.1);
  ctx.fillStyle = wall;
  ctx.fillRect(4, 22, 48, 18);
  ctx.fillRect(2, 8, 3, 14);
  ctx.fillRect(51, 8, 3, 14);
  ctx.fillStyle = lit ? tone('--sand', 0.2) : tone('--line', 0.05);
  ctx.fillRect(4, 18, 48, 4);
  for (let i = 0; i < 6; i += 1) {
    if (!lit) ctx.fillStyle = tone('--line', -0.1);
    else ctx.fillStyle = i % 2 === 0 ? color('--ink') : color('--buoy');
    ctx.fillRect(i * 9, 0, 9, 12);
  }
}

function drawCannery(ctx: CanvasRenderingContext2D, lit: boolean): void {
  ctx.fillStyle = lit ? tone('--sand', -0.3) : tone('--line', -0.1);
  ctx.fillRect(0, 12, 60, 26);
  ctx.fillStyle = tone('--sand', -0.25);
  ctx.fillRect(46, 0, 10, 16);
  if (lit) {
    ctx.fillStyle = alpha('--ink', 0.5);
    ctx.beginPath();
    ctx.arc(52, -6, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = tone('--sand', -0.4);
  ctx.fillRect(2, 28, 8, 8);
  ctx.fillRect(11, 28, 8, 8);
  ctx.fillRect(6, 20, 8, 8);
  ctx.fillStyle = tone('--sand', 0.15);
  ctx.fillRect(32, 20, 10, 10);
}

function drawInn(ctx: CanvasRenderingContext2D, lit: boolean): void {
  ctx.fillStyle = lit ? tone('--sand', 0.15) : tone('--sand', -0.35);
  ctx.fillRect(6, 10, 40, 30);
  ctx.fillStyle = lit ? tone('--sand', -0.45) : tone('--line', -0.05);
  ctx.beginPath();
  ctx.moveTo(2, 10);
  ctx.lineTo(26, -4);
  ctx.lineTo(50, 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = lit ? color('--buoy') : tone('--line', -0.05);
  ctx.fillRect(22, 24, 10, 16);
  ctx.fillStyle = tone('--sand', -0.45);
  ctx.fillRect(48, 18, 2, 12);
  ctx.fillStyle = lit ? color('--gold') : tone('--sand', -0.35);
  ctx.fillRect(50, 22, 12, 9);
}

/** A halo of light under a stall that is buying. */
export function glowSprite(): HTMLCanvasElement {
  return sprite('glow', 80, 64, (ctx) => {
    ctx.fillStyle = alpha('--gold', 0.35);
    ctx.beginPath();
    ctx.ellipse(40, 32, 38, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = alpha('--gold', 0.45);
    ctx.beginPath();
    ctx.ellipse(40, 32, 26, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** A spark of the chest that opens. */
export function sparkSprite(): HTMLCanvasElement {
  return sprite('spark', 6, 6, (ctx) => {
    ctx.fillStyle = color('--gold');
    ctx.fillRect(1, 1, 4, 4);
  });
}
