// harbor.ts — procedural 2D canvas scene of the waiting harbour.
//
// Drawn when no contract is configured yet or when the node is unreachable:
// an honest picture of the quay, calm water, a moored boat and a buoy,
// waiting for the testnet contract. Flat maritime palette only, no gradients,
// DPR-capped at 2, reduced-motion aware.

import { alpha, color, loadPalette, tone } from '../scene/palette';
import {
  BOAT_ANCHOR, CHEST_ANCHOR, GULL_ANCHOR, blit, boatSprite,
  chestSprite, gullSprite,
} from '../scene/sprites';

export const HARBOR_W = 760;
export const HARBOR_H = 220;

export interface HarborScene {
  destroy(): void;
}

function drawSky(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = color('--bg');
  ctx.fillRect(0, 0, HARBOR_W, 90);
  ctx.fillStyle = alpha('--panel', 0.6);
  ctx.fillRect(0, 50, HARBOR_W, 40);
  ctx.strokeStyle = tone('--line', -0.15);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 90);
  ctx.lineTo(HARBOR_W, 90);
  ctx.stroke();
}

function drawWater(ctx: CanvasRenderingContext2D, phase: number): void {
  ctx.fillStyle = color('--sea');
  ctx.fillRect(0, 90, HARBOR_W, HARBOR_H - 90);
  ctx.strokeStyle = alpha('--ink', 0.14);
  ctx.lineWidth = 1.5;
  for (let row = 0; row < 5; row += 1) {
    const y = 104 + row * 22;
    ctx.beginPath();
    for (let x = 0; x <= HARBOR_W; x += 10) {
      const wob = Math.sin(x / 32 + phase + row * 1.4) * 2.5;
      if (x === 0) ctx.moveTo(x, y + wob);
      else ctx.lineTo(x, y + wob);
    }
    ctx.stroke();
  }
}

function drawQuay(ctx: CanvasRenderingContext2D): void {
  const qx = 0;
  const qy = 130;
  const qw = 240;
  const qh = HARBOR_H - qy;
  ctx.fillStyle = tone('--sand', -0.32);
  ctx.fillRect(qx, qy, qw, qh);
  ctx.strokeStyle = tone('--sand', -0.55);
  ctx.lineWidth = 2;
  ctx.strokeRect(qx - 2, qy, qw + 2, qh + 2);
  ctx.strokeStyle = alpha('--bg', 0.25);
  ctx.lineWidth = 1;
  for (let x = qx + 18; x < qw; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, qy);
    ctx.lineTo(x, HARBOR_H);
    ctx.stroke();
  }
  drawBollards(ctx, qw, qy);
}

function drawBollards(ctx: CanvasRenderingContext2D, qw: number, qy: number): void {
  ctx.fillStyle = tone('--sand', -0.6);
  for (const py of [qy + 16, qy + 48, qy + 76]) {
    ctx.beginPath();
    ctx.arc(qw - 12, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = tone('--sand', -0.7);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  blit(ctx, chestSprite(false), CHEST_ANCHOR, 90, qy + 36);
  ctx.fillStyle = alpha('--ink', 0.6);
  ctx.font = '10px monospace';
  ctx.fillText('PORT DE TIDEWATER · QUAI 1', 18, qy + 72);
}

function drawBuoy(ctx: CanvasRenderingContext2D, x: number, y: number, phase: number): void {
  const bob = Math.sin(phase * 1.2) * 2;
  const by = y + bob;
  ctx.fillStyle = color('--buoy');
  ctx.beginPath();
  ctx.moveTo(x, by - 16);
  ctx.lineTo(x + 12, by + 10);
  ctx.lineTo(x - 12, by + 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color('--ink');
  ctx.beginPath();
  ctx.arc(x, by + 12, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = tone('--buoy', -0.3);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, by - 16);
  ctx.lineTo(x, by - 24);
  ctx.stroke();
}

function drawMooredBoat(ctx: CanvasRenderingContext2D, x: number, y: number, phase: number): void {
  const bob = Math.sin(phase * 0.9) * 2;
  const by = y + bob;
  blit(ctx, boatSprite(color('--buoy'), false), BOAT_ANCHOR, x, by);
  ctx.strokeStyle = alpha('--ink', 0.45);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(240 - 12, 146);
  ctx.quadraticCurveTo(x - 24, by + 12, x - 10, by + 6);
  ctx.stroke();
}

function drawGull(ctx: CanvasRenderingContext2D, x: number, y: number, phase: number): void {
  const gx = x + Math.sin(phase * 0.4) * 16;
  const gy = y + Math.cos(phase * 0.3) * 6;
  blit(ctx, gullSprite(), GULL_ANCHOR, gx, gy);
}

export function paintHarbor(
  ctx: CanvasRenderingContext2D,
  phase: number,
): void {
  drawSky(ctx);
  drawWater(ctx, phase);
  drawQuay(ctx);
  drawMooredBoat(ctx, 330, 150, phase);
  drawBuoy(ctx, 620, 154, phase);
  drawGull(ctx, 480, 52, phase);
  drawGull(ctx, 580, 70, phase + 1.2);
}

interface SceneState {
  ctx: CanvasRenderingContext2D;
  mql: MediaQueryList;
  raf: number;
  phase: number;
  last: number;
  alive: boolean;
}

function render(state: SceneState, now: number): void {
  if (!state.alive) return;
  if (document.visibilityState === 'visible') {
    state.phase += ((now - state.last) / 1000) * 0.9;
    state.last = now;
    paintHarbor(state.ctx, state.phase);
  }
  if (!state.mql.matches) {
    state.raf = window.requestAnimationFrame((t) => render(state, t));
  }
}

/** One repaint pass: still picture with reduced motion, loop otherwise. */
function schedule(state: SceneState): void {
  window.cancelAnimationFrame(state.raf);
  if (state.mql.matches) {
    paintHarbor(state.ctx, 0);
    return;
  }
  state.last = performance.now();
  state.raf = window.requestAnimationFrame((t) => render(state, t));
}

export function startHarborScene(canvas: HTMLCanvasElement): HarborScene {
  loadPalette();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(HARBOR_W * dpr);
  canvas.height = Math.round(HARBOR_H * dpr);
  const maybeCtx = canvas.getContext('2d');
  if (maybeCtx === null) return { destroy: () => undefined };
  maybeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const state: SceneState = {
    ctx: maybeCtx,
    mql: window.matchMedia('(prefers-reduced-motion: reduce)'),
    raf: 0,
    phase: 0,
    last: performance.now(),
    alive: true,
  };
  schedule(state);
  const onMotion = (): void => { schedule(state); };
  state.mql.addEventListener('change', onMotion);
  return {
    destroy(): void {
      state.alive = false;
      window.cancelAnimationFrame(state.raf);
      state.mql.removeEventListener('change', onMotion);
    },
  };
}
