// icons.ts — procedural canvas icons for the proofs page.
//
// Reuses the sprites of `scene/sprites.ts` where available (boat deed, fish,
// crate, harbour chest), and provides the tokens unique to the contract
// (gold coins, licence stamp, debt note). All drawings use the palette
// of `scene/palette.ts` (flat tints, no gradients, no external assets).
//
// Report note: the extra marks (gold, licence, loan) should be merged into
// `web/src/scene/sprites.ts` once the scene HUD needs them.

import { color, loadPalette, tone } from '../scene/palette';
import {
  BOAT_ANCHOR, CHEST_ANCHOR, CRATE_ANCHOR, FISH_ANCHOR, blit, boatSprite,
  chestSprite, crateSprite, fishSprite,
} from '../scene/sprites';

export type TokenIconKind =
  | 'gold'
  | 'herring'
  | 'cod'
  | 'licence'
  | 'deed'
  | 'loan';

const BOX = 64;

function ellipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Three stacked gold coins, flat rim and body. */
function drawGold(ctx: CanvasRenderingContext2D): void {
  const rim = tone('--gold', -0.38);
  const fill = color('--gold');
  for (const cy of [44, 32, 20]) {
    ctx.fillStyle = rim;
    ellipse(ctx, 32, cy + 4, 22, 9);
    ctx.fillStyle = fill;
    ellipse(ctx, 32, cy, 22, 9);
  }
  ctx.strokeStyle = rim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(10, 20);
  ctx.lineTo(10, 44);
  ctx.moveTo(54, 20);
  ctx.lineTo(54, 44);
  ctx.stroke();
}

/** A licence parchment with a punched eyelet and an anchor mark. */
function drawLicence(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = tone('--sand', -0.15);
  ctx.beginPath();
  ctx.moveTo(18, 10);
  ctx.lineTo(46, 10);
  ctx.lineTo(54, 24);
  ctx.lineTo(46, 54);
  ctx.lineTo(18, 54);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = tone('--sand', -0.5);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = color('--bg');
  ellipse(ctx, 32, 20, 5, 5);
  ctx.strokeStyle = color('--buoy');
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(24, 36);
  ctx.lineTo(31, 44);
  ctx.lineTo(44, 30);
  ctx.stroke();
}

/** A promissory debt note: folded sheet, lines, and a red wax seal. */
function drawLoan(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = tone('--sand', -0.28);
  ctx.fillRect(14, 10, 36, 44);
  ctx.strokeStyle = tone('--sand', -0.55);
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 10, 36, 44);
  ctx.strokeStyle = color('--panel');
  ctx.lineWidth = 2;
  for (const y of [22, 30, 38]) {
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(44, y);
    ctx.stroke();
  }
  ctx.fillStyle = color('--red');
  ellipse(ctx, 42, 44, 6, 6);
}

/** Herring: uses fishSprite scaled up, with silvery tint. */
function drawHerring(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(32, 32);
  ctx.scale(2.2, 2.2);
  blit(ctx, fishSprite(), FISH_ANCHOR, 0, 0);
  ctx.restore();
}

/** Cod: two stacked catch crates, representing heavier bulk fish. */
function drawCod(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(32, 24);
  ctx.scale(1.8, 1.8);
  blit(ctx, crateSprite(), CRATE_ANCHOR, -4, 8);
  blit(ctx, crateSprite(), CRATE_ANCHOR, 4, 2);
  ctx.restore();
}

/** Boat deed: rigged boat sprite from scene. */
function drawDeed(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(32, 32);
  ctx.scale(1.1, 1.1);
  blit(ctx, boatSprite(color('--buoy'), true), BOAT_ANCHOR, 0, 0);
  ctx.restore();
}

/** Render a token icon into a target canvas (size x size). */
export function paintTokenIcon(
  canvas: HTMLCanvasElement,
  kind: TokenIconKind,
  size = 48,
): void {
  loadPalette();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const ctx = canvas.getContext('2d');
  if (ctx === null) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.scale(size / BOX, size / BOX);
  if (kind === 'gold') drawGold(ctx);
  else if (kind === 'herring') drawHerring(ctx);
  else if (kind === 'cod') drawCod(ctx);
  else if (kind === 'licence') drawLicence(ctx);
  else if (kind === 'deed') drawDeed(ctx);
  else if (kind === 'loan') drawLoan(ctx);
  ctx.restore();
}

/** Convenience: draw the port fund chest into a canvas. */
export function paintChestIcon(canvas: HTMLCanvasElement, size = 48): void {
  loadPalette();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const ctx = canvas.getContext('2d');
  if (ctx === null) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(size / 38, size / 38);
  blit(ctx, chestSprite(false), CHEST_ANCHOR, 0, 0);
  ctx.restore();
}
