// hud.ts — the panels become instruments.
//
// The day dial (sun or moon), the criée: a price that falls with a
// countdown, the gauge of the harbour fund, and the proportional bars
// of the register. Everything is drawn flat, in the palette.

import { alpha, alphaHex, color, tone } from './palette';
import { DIAL_RECT, HUD_H, MAP_H, MAP_W } from './layout';

export interface AuctionView {
  active: boolean;
  price: number;
  start: number;
  endsAt: number;
  buyer: number;
  buyerName: string;
}

export interface FundView { level: number; amount: number }

export interface LedgerRow { name: string; crates: number; share: number }

export interface HudView {
  dayPhase: number;
  dayLabel: string;
  week: number;
  auction: AuctionView;
  fund: FundView;
  ledger: LedgerRow[];
}

const AUCTION_RECT = { x: 12, y: MAP_H + 8, w: 366, h: HUD_H - 16 };
const FUND_RECT = { x: 386, y: MAP_H + 8, w: 134, h: HUD_H - 16 };
const LEDGER_RECT = { x: 528, y: MAP_H + 8, w: 220, h: HUD_H - 16 };

/** The dial in the corner: the sun by day, the moon at night. */
export function drawDial(ctx: CanvasRenderingContext2D, hud: HudView): void {
  const r = DIAL_RECT;
  ctx.fillStyle = color('--panel');
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = alpha('--line', 0.9);
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h - 14;
  ctx.strokeStyle = alpha('--muted', 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 26, Math.PI, Math.PI * 2);
  ctx.stroke();
  const phase = Math.max(0, Math.min(1, hud.dayPhase));
  const angle = Math.PI + Math.PI * phase;
  const x = cx + Math.cos(angle) * 26;
  const y = cy + Math.sin(angle) * 26;
  if (phase < 0.62) drawSun(ctx, x, y);
  else drawMoon(ctx, x, y);
  ctx.fillStyle = alpha('--muted', 0.95);
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${hud.dayLabel.toUpperCase()} · W${hud.week}`, cx, r.y + 12);
  ctx.textAlign = 'left';
}

function drawSun(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = alpha('--gold', 0.8);
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i += 1) {
    const a = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7);
    ctx.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10);
    ctx.stroke();
  }
  ctx.fillStyle = color('--gold');
  ctx.beginPath();
  ctx.arc(x, y, 5.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = color('--ink');
  ctx.beginPath();
  ctx.arc(x, y, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color('--panel');
  ctx.beginPath();
  ctx.arc(x + 2.6, y - 1.6, 4.6, 0, Math.PI * 2);
  ctx.fill();
}

/** The band of instruments under the chart. */
export function drawHudBand(ctx: CanvasRenderingContext2D, hud: HudView, now: number): void {
  ctx.fillStyle = color('--panel');
  ctx.fillRect(0, MAP_H, MAP_W, HUD_H);
  ctx.strokeStyle = color('--line');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, MAP_H + 1);
  ctx.lineTo(MAP_W, MAP_H + 1);
  ctx.stroke();
  drawAuction(ctx, hud, now);
  drawFund(ctx, hud.fund);
  drawLedger(ctx, hud.ledger);
}

function panel(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }): void {
  ctx.fillStyle = alpha('--bg', 0.45);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = alpha('--line', 0.9);
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}

function title(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.fillStyle = color('--sand');
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText(text, x, y);
}

function drawAuction(ctx: CanvasRenderingContext2D, hud: HudView, now: number): void {
  const r = AUCTION_RECT;
  const a = hud.auction;
  panel(ctx, r);
  title(ctx, 'AUCTION', r.x + 10, r.y + 16);
  ctx.fillStyle = a.active ? color('--ink') : alpha('--muted', 0.8);
  ctx.font = '12px sans-serif';
  ctx.fillText(a.active ? `${a.buyerName} buys` : 'the criée waits', r.x + 10, r.y + 34);
  ctx.fillStyle = a.active ? color('--buoy') : alpha('--muted', 0.7);
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`${Math.round(a.price)} g`, r.x + 10, r.y + 62);
  drawPriceBar(ctx, r, a);
  ctx.fillStyle = alpha('--muted', 0.9);
  ctx.font = '10px sans-serif';
  const left = a.active ? Math.max(0, Math.ceil((a.endsAt - now) / 1000)) : 0;
  ctx.fillText(a.active ? `closes in ${left}s` : 'no lot offered', r.x + 10, r.y + r.h - 8);
}

function drawPriceBar(
  ctx: CanvasRenderingContext2D,
  r: { x: number; y: number; w: number; h: number },
  a: AuctionView,
): void {
  const x = r.x + 96;
  const w = r.w - 116;
  const y = r.y + 44;
  ctx.fillStyle = alpha('--ink', 0.16);
  ctx.fillRect(x, y, w, 12);
  const ratio = a.start > 0 ? Math.max(0, Math.min(1, a.price / a.start)) : 0;
  ctx.fillStyle = color('--buoy');
  ctx.fillRect(x, y, w * ratio, 12);
  ctx.strokeStyle = alpha('--ink', 0.45);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 11);
}

function drawFund(ctx: CanvasRenderingContext2D, fund: FundView): void {
  const r = FUND_RECT;
  panel(ctx, r);
  title(ctx, 'HARBOUR FUND', r.x + 10, r.y + 16);
  ctx.fillStyle = color('--gold');
  ctx.font = 'bold 17px sans-serif';
  ctx.fillText(`${Math.round(fund.amount)} g`, r.x + 10, r.y + 44);
  const x = r.x + 10;
  const w = r.w - 20;
  const y = r.y + 56;
  ctx.fillStyle = alpha('--ink', 0.16);
  ctx.fillRect(x, y, w, 10);
  ctx.fillStyle = color('--gold');
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, fund.level)), 10);
  ctx.strokeStyle = alpha('--ink', 0.4);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 9);
  ctx.fillStyle = alpha('--muted', 0.9);
  ctx.font = '10px sans-serif';
  ctx.fillText('the chest on the quay', x, r.y + r.h - 8);
}

function drawLedger(ctx: CanvasRenderingContext2D, rows: LedgerRow[]): void {
  const r = LEDGER_RECT;
  panel(ctx, r);
  title(ctx, 'REGISTER', r.x + 10, r.y + 16);
  const shown = Math.min(rows.length, 4);
  for (let i = 0; i < shown; i += 1) {
    const row = rows[i];
    const y = r.y + 32 + i * 16;
    ctx.fillStyle = color('--ink');
    ctx.font = '10px sans-serif';
    ctx.fillText(row.name.slice(0, 12), r.x + 10, y);
    const barX = r.x + 84;
    const barW = r.w - 132;
    ctx.fillStyle = alpha('--ink', 0.16);
    ctx.fillRect(barX, y - 8, barW, 7);
    ctx.fillStyle = color('--kelp');
    ctx.fillRect(barX, y - 8, barW * Math.max(0, Math.min(1, row.share)), 7);
    ctx.fillStyle = alpha('--muted', 0.95);
    ctx.fillText(`${row.crates}`, r.x + r.w - 40, y);
  }
}

/** The wash of the day: warm at dawn, cold at dusk. */
export function drawVeil(ctx: CanvasRenderingContext2D, phase: number): void {
  const p = Math.max(0, Math.min(1, phase));
  if (p < 0.15) {
    ctx.fillStyle = alpha('--gold', 0.10 * (1 - p / 0.15));
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    return;
  }
  if (p < 0.7) return;
  if (p < 0.9) {
    ctx.fillStyle = alpha('--bg', 0.16 * ((p - 0.7) / 0.2));
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    return;
  }
  ctx.fillStyle = alphaHex(tone('--sea', -0.4), 0.34);
  ctx.fillRect(0, 0, MAP_W, MAP_H);
}
