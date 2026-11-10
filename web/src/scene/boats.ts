// boats.ts — the fleet: hulls that sail, a wake astern, an arrival.
//
// A boat never teleports: when its mark changes, it glides there
// over one second. The tween easing lives in `fx.ts` so the whole
// scene shares one curve.

import { alpha, color } from './palette';
import { quayMark, zoneMark, type Pt, type ZoneKey } from './layout';
import { BOAT_ANCHOR, blit, boatSprite } from './sprites';
import { ease } from './fx';

export interface BoatModel {
  id: string;
  hull: string;
  zone: ZoneKey | null;
  mine: boolean;
  disarmed: boolean;
  /** True on the boat the player picked: the scene rings it. */
  selected?: boolean;
}

interface BoatEntry {
  model: BoatModel;
  x: number;
  y: number;
  tx: number;
  ty: number;
  fx: number;
  fy: number;
  t0: number;
  dur: number;
  moving: boolean;
}

const SAIL_MS = 1000;

export class Fleet {
  /** Called when a boat reaches its mark: it splashes. */
  onArrive: (x: number, y: number) => void = () => {};

  private entries = new Map<string, BoatEntry>();
  private list: BoatEntry[] = [];
  private counters = new Map<string, number>();

  /** Point every boat at its mark; start a sail when the mark moved. */
  sync(boats: BoatModel[], now: number): void {
    this.counters.clear();
    const live = new Set<string>();
    for (const boat of boats) {
      live.add(boat.id);
      const target = this.target(boat);
      const entry = this.entries.get(boat.id);
      if (entry === undefined) {
        this.entries.set(boat.id, {
          model: boat, x: target.x, y: target.y, tx: target.x, ty: target.y,
          fx: target.x, fy: target.y, t0: now, dur: SAIL_MS, moving: false,
        });
        continue;
      }
      entry.model = boat;
      if (target.x !== entry.tx || target.y !== entry.ty) {
        entry.fx = entry.x;
        entry.fy = entry.y;
        entry.tx = target.x;
        entry.ty = target.y;
        entry.t0 = now;
        entry.dur = SAIL_MS;
        entry.moving = true;
      }
    }
    for (const id of Array.from(this.entries.keys())) {
      if (!live.has(id)) this.entries.delete(id);
    }
    this.list = [];
    this.entries.forEach((entry) => this.list.push(entry));
  }

  /** The deterministic mark of a boat: its berth or its fishing ground. */
  private target(boat: BoatModel): Pt {
    const key = boat.zone ?? 'quay';
    const index = this.counters.get(key) ?? 0;
    this.counters.set(key, index + 1);
    return boat.zone === null ? quayMark(index) : zoneMark(boat.zone, index);
  }

  /** Where a boat is right now, for the events that start from it. */
  mark(id: string): Pt | null {
    const entry = this.entries.get(id);
    if (entry === undefined) return null;
    return { x: entry.x, y: entry.y };
  }

  /** Move the fleet along its tweens and paint it. */
  draw(ctx: CanvasRenderingContext2D, now: number): void {
    for (let i = 0; i < this.list.length; i += 1) {
      const entry = this.list[i];
      if (entry.moving) {
        const k = Math.min(1, (now - entry.t0) / entry.dur);
        const e = ease(k);
        entry.x = entry.fx + (entry.tx - entry.fx) * e;
        entry.y = entry.fy + (entry.ty - entry.fy) * e;
        if (k >= 1) {
          entry.moving = false;
          this.onArrive(entry.x, entry.y);
        }
      }
      if (entry.moving) drawWake(ctx, entry);
      drawHull(ctx, entry);
    }
  }
}

function drawWake(ctx: CanvasRenderingContext2D, entry: BoatEntry): void {
  const angle = Math.atan2(entry.ty - entry.fy, entry.tx - entry.fx);
  const back = angle + Math.PI;
  ctx.strokeStyle = alpha('--ink', 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const spread of [-0.5, 0, 0.5]) {
    const a = back + spread;
    ctx.moveTo(entry.x + Math.cos(a) * 12, entry.y + Math.sin(a) * 6);
    ctx.lineTo(entry.x + Math.cos(a) * 22, entry.y + Math.sin(a) * 11);
  }
  ctx.stroke();
}

function drawHull(ctx: CanvasRenderingContext2D, entry: BoatEntry): void {
  const { model } = entry;
  ctx.save();
  ctx.translate(entry.x, entry.y);
  if (model.disarmed) ctx.rotate(Math.PI / 2);
  if (model.mine) {
    ctx.strokeStyle = color('--buoy');
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (model.selected === true) {
    // The picked boat: a dashed ring outside the captain's ring.
    ctx.strokeStyle = color('--sand');
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, 23, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  blit(ctx, boatSprite(model.hull, !model.disarmed), BOAT_ANCHOR, 0, 0);
  ctx.restore();
}
