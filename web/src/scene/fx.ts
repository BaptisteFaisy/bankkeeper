// fx.ts — one tween per event.
//
// A crate in the air, a splash, a stall that lights up, a chest that
// opens, the gull that follows the lot being sold. Each of them starts
// on an event and ends on its own: no decorative loop that burns CPU.

import { alpha } from './palette';
import { STALL_MARKS } from './layout';
import {
  CRATE_ANCHOR, GULL_ANCHOR, blit, crateSprite, glowSprite, gullSprite,
  sparkSprite,
} from './sprites';

const SPARK_ANCHOR = { x: 3, y: 3 };

export interface Splash { x: number; y: number; t0: number; alive: boolean }
export interface Crate { x0: number; y0: number; x1: number; y1: number; t0: number; alive: boolean }

export interface FxState {
  splashes: Splash[];
  crates: Crate[];
  stallGlow: number[];
  chestT0: number;
  chestX: number;
  chestY: number;
  gullT0: number;
  gullX: number;
  gullY: number;
}

const CRATE_MS = 900;
const SPLASH_MS = 700;
const GLOW_MS = 1600;
const CHEST_MS = 1500;
const GULL_MS = 7000;
const FAR = -1e9;

/** The one easing of the scene: quick start, soft landing. */
export function ease(k: number): number {
  return k * (2 - k);
}

export function createFx(): FxState {
  const splashes: Splash[] = [];
  for (let i = 0; i < 12; i += 1) splashes.push({ x: 0, y: 0, t0: FAR, alive: false });
  const crates: Crate[] = [];
  for (let i = 0; i < 8; i += 1) crates.push({ x0: 0, y0: 0, x1: 0, y1: 0, t0: FAR, alive: false });
  return {
    splashes, crates, stallGlow: [FAR, FAR, FAR],
    chestT0: FAR, chestX: 0, chestY: 0, gullT0: FAR, gullX: 0, gullY: 0,
  };
}

/** A hull meets the water. */
export function fxSplash(fx: FxState, x: number, y: number, now: number): void {
  const slot = fx.splashes.find((s) => !s.alive);
  if (slot === undefined) return;
  slot.x = x;
  slot.y = y;
  slot.t0 = now;
  slot.alive = true;
}

/** A crate leaves the boat and arcs to the quay. */
export function fxCrate(fx: FxState, x0: number, y0: number, x1: number, y1: number, now: number): void {
  const slot = fx.crates.find((c) => !c.alive);
  if (slot === undefined) return;
  slot.x0 = x0;
  slot.y0 = y0;
  slot.x1 = x1;
  slot.y1 = y1;
  slot.t0 = now;
  slot.alive = true;
}

/** A stall starts buying. */
export function fxStall(fx: FxState, index: number, now: number): void {
  if (index < 0 || index >= fx.stallGlow.length) return;
  fx.stallGlow[index] = now;
}

/** The harbour chest opens on a paid motion. */
export function fxChest(fx: FxState, x: number, y: number, now: number): void {
  fx.chestT0 = now;
  fx.chestX = x;
  fx.chestY = y;
}

/** The gull follows the lot being sold. */
export function fxGull(fx: FxState, x: number, y: number, now: number): void {
  fx.gullT0 = now;
  fx.gullX = x;
  fx.gullY = y;
}

/** Is the chest still open? The sea draws it that way. */
export function chestIsOpen(fx: FxState, now: number): boolean {
  return now - fx.chestT0 < CHEST_MS;
}

/** The halo under a stall that is buying: painted under the stalls. */
export function drawGlows(ctx: CanvasRenderingContext2D, fx: FxState, now: number): void {
  const img = glowSprite();
  for (let i = 0; i < fx.stallGlow.length; i += 1) {
    const age = now - fx.stallGlow[i];
    if (age < 0 || age > GLOW_MS) continue;
    const mark = STALL_MARKS[i];
    ctx.globalAlpha = 0.85 * (1 - age / GLOW_MS);
    ctx.drawImage(img, mark.x + 32 - 40, mark.y + 24 - 32);
    ctx.globalAlpha = 1;
  }
}

/** The crates in the air, the splashes, the sparks and the gull. */
export function drawFx(ctx: CanvasRenderingContext2D, fx: FxState, now: number): void {
  drawCrates(ctx, fx, now);
  drawSplashes(ctx, fx, now);
  drawSparks(ctx, fx, now);
  drawGull(ctx, fx, now);
}

function drawCrates(ctx: CanvasRenderingContext2D, fx: FxState, now: number): void {
  const img = crateSprite();
  for (const crate of fx.crates) {
    if (!crate.alive) continue;
    const k = (now - crate.t0) / CRATE_MS;
    if (k >= 1) {
      crate.alive = false;
      fxSplash(fx, crate.x1, crate.y1, now);
      continue;
    }
    const hop = Math.sin(Math.PI * k) * 46;
    const x = crate.x0 + (crate.x1 - crate.x0) * k;
    const y = crate.y0 + (crate.y1 - crate.y0) * k - hop;
    blit(ctx, img, CRATE_ANCHOR, x, y);
  }
}

function drawSplashes(ctx: CanvasRenderingContext2D, fx: FxState, now: number): void {
  for (const splash of fx.splashes) {
    if (!splash.alive) continue;
    const age = now - splash.t0;
    if (age > SPLASH_MS) {
      splash.alive = false;
      continue;
    }
    const k = age / SPLASH_MS;
    ctx.strokeStyle = alpha('--ink', 0.85 * (1 - k));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(splash.x, splash.y, 6 + 24 * k, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawSparks(ctx: CanvasRenderingContext2D, fx: FxState, now: number): void {
  const age = now - fx.chestT0;
  if (age < 0 || age > CHEST_MS) return;
  const img = sparkSprite();
  for (let i = 0; i < 5; i += 1) {
    const k = age / CHEST_MS + i * 0.12;
    const x = fx.chestX + (i - 2) * 7;
    const y = fx.chestY - k * 34;
    ctx.globalAlpha = Math.max(0, 1 - k);
    blit(ctx, img, SPARK_ANCHOR, x, y);
    ctx.globalAlpha = 1;
  }
}

function drawGull(ctx: CanvasRenderingContext2D, fx: FxState, now: number): void {
  const age = now - fx.gullT0;
  if (age < 0 || age > GULL_MS) return;
  const img = gullSprite();
  const a = age / 320;
  const x = fx.gullX + Math.cos(a) * 24;
  const y = fx.gullY + Math.sin(a) * 11;
  blit(ctx, img, GULL_ANCHOR, x, y);
}
