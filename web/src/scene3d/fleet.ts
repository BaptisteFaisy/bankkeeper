// fleet.ts — the trawler and the ten hulls that sail it. The game says where
// each boat is (a ground or the quay); the fleet sails there, and no two
// hulls ever overlap. Bow points to +x in the model.

import { Geo } from './geo';
import type { Vec3 } from './math';
import type { BoatModel } from '../scene/boats';
import { QZ } from './harbour';

export interface Ground { id: string; name: string; fish: string; x: number; z: number; r: number }

export const GROUNDS: Ground[] = [
  { id: 'shallows', name: 'The Shallows', fish: 'herring', x: -46, z: -24, r: 18 },
  { id: 'greybank', name: 'Greybank', fish: 'herring', x: 26, z: -6, r: 25 },
  { id: 'deeps', name: 'The Deeps', fish: 'cod', x: -12, z: 30, r: 20 },
];

/** Stations of the hull: x, half-beam, sheer height, keel depth. */
const ST: number[][] = [[-7, 1.55, 1.75, -0.2], [-5.6, 1.95, 1.5, -0.6], [-2, 2.15, 1.3, -0.85], [2, 2.05, 1.4, -0.85], [5, 1.35, 1.95, -0.6], [7.2, 0.06, 2.6, 0.3]];

function hullPoint(s: number[], side: number, level: number): Vec3 {
  if (level === 0) return [s[0], s[3], 0];
  if (level === 1) return [s[0], s[3] + (s[2] - s[3]) * 0.45, side * s[1] * 0.86];
  return [s[0], s[2], side * s[1]];
}

function hull(g: Geo): void {
  for (let k = 0; k < ST.length - 1; k++) {
    for (const side of [-1, 1]) {
      const a = ST[k], b = ST[k + 1];
      g.quad(hullPoint(a, side, 0), hullPoint(b, side, 0), hullPoint(b, side, 1), hullPoint(a, side, 1));
      g.quad(hullPoint(a, side, 1), hullPoint(b, side, 1), hullPoint(b, side, 2), hullPoint(a, side, 2));
      g.line(hullPoint(a, side, 2), hullPoint(b, side, 2), 1);
      g.line(hullPoint(a, side, 1), hullPoint(b, side, 1), 0.45);
      const deck = (s: number[]): Vec3 => [s[0], s[2] - 0.45, side * s[1] * 0.92];
      g.quad(deck(a), deck(b), [b[0], b[2] - 0.45, 0], [a[0], a[2] - 0.45, 0]);
      g.line([a[0], a[2] - 0.28, side * a[1] * 1.01], [b[0], b[2] - 0.28, side * b[1] * 1.01], 0.35);
    }
  }
  const s = ST[0];
  g.quad(hullPoint(s, -1, 2), hullPoint(s, 1, 2), hullPoint(s, 1, 1), hullPoint(s, -1, 1));
  g.tri(hullPoint(s, -1, 1), hullPoint(s, 1, 1), hullPoint(s, 0, 0));
  const bow = ST[ST.length - 1];
  g.line([bow[0], bow[2], 0], [bow[0] - 0.9, bow[3] - 0.6, 0], 1);
}

function house(g: Geo): void {
  g.box(-2.6, 1.1, 0, 3.6, 2.5, 2.7, { i: 0.9 });
  g.box(-2.6, 3.6, 0, 4.2, 0.22, 3.2, { i: 0.9 });
  const y0 = 2.35, y1 = 3.25;
  g.quad([-0.78, y0, -1.15], [-0.78, y0, 1.15], [-0.78, y1, 1.15], [-0.78, y1, -1.15], 0.95);
  for (const z of [-1.37, 1.37]) g.quad([-4, y0, z], [-1.1, y0, z], [-1.1, y1, z], [-4, y1, z], 0.9);
  g.cyl(-3.9, 3.8, 0.7, 0.3, 1.6, 6, { i: 0.7 });
  g.line([-2.2, 3.8, 0], [-2.2, 5.6, 0], 0.9);
  g.line([-2.8, 5.1, 0], [-1.6, 5.1, 0], 0.9);
  g.box(-2.2, 5.6, 0, 0.3, 0.3, 0.3, { e: 1, i: 0 });
}

function rig(g: Geo): void {
  const top: Vec3 = [2.6, 9.4, 0];
  g.box(2.6, 1, 0, 0.32, 8.4, 0.32, { i: 0.9 });
  g.box(2.6, 9.4, 0, 0.36, 0.36, 0.36, { e: 1, i: 0 });
  g.line(top, [7.1, 2.6, 0], 0.55);
  g.line(top, [-0.8, 3.8, 0], 0.55);
  g.line([2.6, 3, 0], [-1, 6.4, 0], 0.95);
  g.line(top, [-1, 6.4, 0], 0.5);
  for (const s of [-1, 1]) {
    const tip: Vec3 = [1.6, 7.4, s * 6.4];
    g.line([2.6, 1.6, s * 0.3], tip, 1);
    g.line(top, tip, 0.5);
    g.line(tip, [tip[0] - 0.4, 3.2, s * 6.9], 0.4);
    g.box(tip[0] - 0.4, 2.6, s * 6.9, 0.5, 0.6, 0.5, { i: 0.7 });
    g.line([2.6, 6, 0], [ST[2][0], ST[2][2], s * ST[2][1]], 0.35);
    g.line([-6.2, 1.2, s * 1.3], [-6.4, 4.4, s * 0.9], 0.95);
  }
  g.line([-6.4, 4.4, -0.9], [-6.4, 4.4, 0.9], 0.95);
  g.box(-5.3, 1.15, 0, 1.1, 1.2, 2.3, { i: 0.75 });
  for (const p of [[4.2, 0.6], [4.6, -0.5], [0.4, 0.9]]) g.box(p[0], 1.1, p[1], 0.9, 0.7, 0.8, { i: 0.6 });
}

export function buildBoat(): Geo {
  const g = new Geo();
  hull(g);
  house(g);
  rig(g);
  return g;
}

export function buildWake(): number[] {
  const t: number[] = [];
  for (const s of [-1, 1]) {
    t.push(-6, 0.1, s * 1.6, 0.7, -36, 0.1, s * 9.5, 0, -32, 0.1, s * 6.5, 0);
    t.push(6.5, 0.1, s * 0.2, 0.5, -4, 0.1, s * 3.4, 0, -6, 0.1, s * 2.2, 0.35);
  }
  t.push(-7, 0.1, -1.2, 0.5, -7, 0.1, 1.2, 0.5, -26, 0.1, 0, 0);
  return t;
}

export const wave = (x: number, z: number, t: number): number =>
  0.22 * Math.sin(x * 0.038 + z * 0.19 + t * 0.9) + 0.14 * Math.sin(-x * 0.2 + z * 0.33 + t * 1.3);

export interface Hull {
  id: string; mine: boolean; selected: boolean; disarmed: boolean; seat: number;
  x: number; z: number; h: number; v: number; tx: number; tz: number; th: number;
}

const MIN_GAP = 9.5;

/** Where the k-th of n boats on a destination should lie. */
function slot(where: string | null, k: number, n: number): { x: number; z: number; h: number } {
  const g = GROUNDS.find((q) => q.id === where);
  if (g === undefined) return { x: -66 + k * 12.5, z: QZ + 6.2, h: 0 };
  const index = GROUNDS.indexOf(g);
  const a = (k / Math.max(1, n)) * Math.PI * 2 + index * 1.3 + 0.4;
  const r = g.r * (n > 5 ? 0.66 : 0.5) * (k % 2 === 1 && n > 5 ? 0.5 : 1);
  return { x: g.x + Math.cos(a) * r, z: g.z + Math.sin(a) * r * 0.8, h: a + Math.PI / 2 };
}

export class Fleet {
  hulls: Hull[] = [];

  /** The game moved: every hull gets its new berth. `snap` skips the voyage. */
  sync(boats: BoatModel[], snap: boolean): void {
    const known = new Map(this.hulls.map((h) => [h.id, h]));
    const counts = new Map<string, number>();
    for (const b of boats) counts.set(b.zone ?? 'quay', (counts.get(b.zone ?? 'quay') ?? 0) + 1);
    const seen = new Map<string, number>();
    this.hulls = boats.map((b, i) => {
      const key = b.zone ?? 'quay';
      const k = seen.get(key) ?? 0;
      seen.set(key, k + 1);
      const s = slot(b.zone, b.zone === null ? i : k, counts.get(key) ?? 1);
      const prev = known.get(b.id);
      const hull: Hull = prev ?? { id: b.id, mine: b.mine, selected: false, disarmed: false, seat: i, x: s.x, z: s.z, h: s.h, v: 0, tx: s.x, tz: s.z, th: s.h };
      Object.assign(hull, { mine: b.mine, selected: b.selected, disarmed: b.disarmed, seat: i, tx: s.x, tz: s.z, th: s.h });
      if (snap) Object.assign(hull, { x: s.x, z: s.z, h: s.h, v: 0 });
      return hull;
    });
  }

  /** Push every close pair apart, with a sideways bias so head-on pairs slip past. */
  private separate(): void {
    const H = this.hulls;
    for (let i = 0; i < H.length; i++) {
      for (let j = i + 1; j < H.length; j++) {
        const a = H[i], b = H[j];
        let dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= MIN_GAP) continue;
        if (d < 1e-3) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
        const push = (MIN_GAP - d) / 2, side = 0.35 * push;
        a.x -= dx * push + dz * side; a.z -= dz * push - dx * side;
        b.x += dx * push + dz * side; b.z += dz * push - dx * side;
      }
    }
  }

  private steer(b: Hull, dt: number): void {
    const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
    const want = d > 1.2 ? Math.atan2(dz, dx) : b.th;
    let da = want - b.h;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    b.h += Math.max(-1.6 * dt, Math.min(1.6 * dt, da));
    const vmax = d > 1.2 ? Math.min(17, 2 + d * 0.9) * Math.max(0.25, Math.cos(da)) : 0;
    b.v += (vmax - b.v) * Math.min(1, dt * 2.5);
    if (d > 1.2) { b.x += Math.cos(b.h) * b.v * dt; b.z += Math.sin(b.h) * b.v * dt; }
    else { b.x += dx * Math.min(1, dt * 2); b.z += dz * Math.min(1, dt * 2); }
  }

  update(dt: number): void {
    this.separate();
    for (const b of this.hulls) this.steer(b, dt);
    this.separate();
  }

  find(id: string): Hull | undefined {
    return this.hulls.find((h) => h.id === id);
  }
}
