// seaPick2d.ts — picking on the 2D chart, the fallback when the browser has
// no WebGL. The marks are the same as the 2D fleet's.
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { BoatView, ZoneId } from '../types';
import type { Scene } from '../scene/scene';
import { reducedMotion } from '../motion';
import { QUAY, VIEW_H, VIEW_W, ZONE_RECTS, quayMark, zoneMark, type ZoneKey } from '../scene/layout';

type Pt = { x: number; y: number };

interface Handlers {
  onPickBoat: (id: string) => void;
  onPickZone: (zone: ZoneId) => void;
  onPickQuay: () => void;
}

/** How near the pointer must be to take a hull. */
const PICK_RADIUS = 20;

function boatSpots(boats: BoatView[]): Array<[string, Pt]> {
  const counts = new Map<string, number>();
  return boats.map((boat) => {
    const key = boat.zone ?? 'quay';
    const index = counts.get(key) ?? 0;
    counts.set(key, index + 1);
    return [boat.id, boat.zone === null ? quayMark(index) : zoneMark(boat.zone, index)];
  });
}

function zoneAt(p: Pt): ZoneKey | null {
  const keys = Object.keys(ZONE_RECTS) as ZoneKey[];
  return keys.find((id) => {
    const r = ZONE_RECTS[id];
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }) ?? null;
}

function inQuay(p: Pt): boolean {
  return p.x >= QUAY.x && p.x <= QUAY.x + QUAY.w && p.y >= QUAY.y && p.y <= QUAY.y + QUAY.h;
}

export function pick2d(canvas: HTMLCanvasElement, event: ReactMouseEvent, boats: BoatView[], h: Handlers, scene: Scene | null): void {
  const rect = canvas.getBoundingClientRect();
  const p = { x: ((event.clientX - rect.left) / rect.width) * VIEW_W, y: ((event.clientY - rect.top) / rect.height) * VIEW_H };
  let best: { id: string; d: number } | null = null;
  for (const [id, mark] of boatSpots(boats)) {
    const d = Math.hypot(mark.x - p.x, mark.y - p.y);
    if (d < PICK_RADIUS && (best === null || d < best.d)) best = { id, d };
  }
  if (best !== null) { h.onPickBoat(best.id); return; }
  const zone = zoneAt(p);
  if (zone === null && !inQuay(p)) return;
  if (scene !== null && !reducedMotion()) scene.emit({ type: 'splash', x: p.x, y: p.y });
  if (zone !== null) h.onPickZone(zone);
  else h.onPickQuay();
}
