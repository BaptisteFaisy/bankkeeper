// scene3d.ts — the harbour in 3D, behind the same contract as the 2D chart:
// one state in, one picture out, one tween per event. It adds what a 3D
// view needs: picking a hull, a ground or the quay under the pointer, and
// labels projected from the world onto a DOM layer.

import type { Scene, SceneEvent, SceneState } from '../scene/scene';
import { stallKind } from '../scene/bridge';
import { project, type Vec3 } from './math';
import { Camera } from './camera';
import { createView, type Crate, type Frame, type View } from './view';
import { Fleet, GROUNDS, type Hull } from './fleet';
import { QZ } from './harbour';
import { Labels } from './labels';

export type Pick = { kind: 'boat'; id: string } | { kind: 'zone'; id: string } | { kind: 'quay' };

export interface Scene3d extends Scene {
  pick(clientX: number, clientY: number): Pick | null;
  hover(clientX: number, clientY: number): void;
  turn(dx: number, dy: number): void;
  zoom(d: number): void;
}

const PLACE_OF_KIND: Record<string, string> = { cannery: 'cannery', inn: 'gull', monger: 'fishmonger' };
const HULL_PICK_PX = 26;

interface Core {
  canvas: HTMLCanvasElement;
  view: View;
  cam: Camera;
  fleet: Fleet;
  labels: Labels;
  state: SceneState | null;
  crates: Crate[];
  t: number;
  last: number;
  raf: number;
  hover: number;
  motion: MediaQueryList;
  w: number;
  h: number;
}

function fit(core: Core): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(core.canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(core.canvas.clientHeight * dpr));
  if (w === core.w && h === core.h) return;
  core.w = core.canvas.width = w;
  core.h = core.canvas.height = h;
  core.cam.aspect = w / h;
  // Leave room for the instrument deck on the right when the screen is wide.
  core.cam.shift = core.canvas.clientWidth >= 1100 ? 404 / core.canvas.clientWidth : 0;
  core.view.resize(w, h);
}

function frameOf(core: Core): Frame {
  const zones = core.state?.zones ?? [];
  const stock = GROUNDS.map((g) => zones.find((z) => z.id === g.id)?.stock ?? 1) as [number, number, number];
  const cam = core.cam;
  return {
    t: core.t, vp: cam.vp, eye: cam.eye,
    cam: { F: cam.F, R: cam.R, U: cam.U, tanX: cam.tanY * cam.aspect, tanY: cam.tanY, shift: cam.shift },
    hulls: core.fleet.hulls, crates: core.crates, stock, rest: [0, 0, 0], focus: [0, 0, 0, 0], hover: core.hover,
  };
}

function paint(core: Core): void {
  fit(core);
  core.cam.update(0, false);
  const f = frameOf(core);
  core.view.paint(f);
  core.labels.place(f.vp, core.canvas.clientWidth, core.canvas.clientHeight, core.fleet.hulls, core.state);
}

function step(core: Core, now: number): void {
  if (document.visibilityState !== 'visible') { core.raf = 0; return; }
  const dt = Math.min(0.05, (now - core.last) / 1000 || 0.016);
  core.last = now;
  core.t += dt;
  core.fleet.update(dt);
  core.cam.update(dt, false);
  core.crates = core.crates.filter((c) => core.t - c.t0 < c.dur);
  paint(core);
  core.raf = window.requestAnimationFrame((n: number) => step(core, n));
}

function start(core: Core): void {
  if (core.raf !== 0 || core.motion.matches) return;
  core.last = performance.now();
  core.raf = window.requestAnimationFrame((n: number) => step(core, n));
}

function still(core: Core): void {
  if (!core.motion.matches) return;
  core.cam.update(0, true);
  paint(core);
}

function applyEvent(core: Core, e: SceneEvent): void {
  if (e.type === 'land') {
    const h = core.fleet.find(e.boatId);
    if (h !== undefined) core.crates.push({ a: [h.x, 3, h.z], b: core.view.harbour.hall, t0: core.t, dur: 1.5 });
    return;
  }
  if (e.type === 'auction') {
    const stall = core.state?.stalls[e.stall];
    if (stall !== undefined) core.labels.flash(PLACE_OF_KIND[stallKind(stall.name)] ?? 'auction', 2200);
    core.labels.flash('auction', 2200);
    return;
  }
  if (e.type === 'chest') core.labels.flash('fund', 2200);
}

function ndc(core: Core, clientX: number, clientY: number): [number, number] {
  const r = core.canvas.getBoundingClientRect();
  return [((clientX - r.left) / r.width) * 2 - 1, 1 - ((clientY - r.top) / r.height) * 2];
}

/** Pixels from the pointer to a hull: to its deck or to its badge, whichever is nearer. */
function hullDistance(core: Core, r: DOMRect, h: Hull, clientX: number, clientY: number): number {
  let best = Infinity;
  for (const y of [2, 8.5]) {
    const p = project(core.cam.vp, [h.x, y, h.z] as Vec3);
    if (p[2] <= 0) continue;
    const sx = r.left + (p[0] * 0.5 + 0.5) * r.width, sy = r.top + (0.5 - p[1] * 0.5) * r.height;
    best = Math.min(best, Math.hypot(sx - clientX, sy - clientY));
  }
  return best;
}

/** The hull under the pointer. In a crowd, your own boats win: they are the ones you can command. */
function pickHull(core: Core, clientX: number, clientY: number): Hull | null {
  const r = core.canvas.getBoundingClientRect();
  let best: Hull | null = null, bestD = HULL_PICK_PX;
  for (const h of core.fleet.hulls) {
    const d = hullDistance(core, r, h, clientX, clientY) * (h.mine ? 0.5 : 1);
    if (d < bestD) { best = h; bestD = d; }
  }
  return best;
}

function groundAt(core: Core, clientX: number, clientY: number): number {
  const [nx, ny] = ndc(core, clientX, clientY);
  const p = core.cam.seaPoint(nx, ny);
  if (p === null) return -1;
  return GROUNDS.findIndex((g) => Math.hypot(p[0] - g.x, p[1] - g.z) <= g.r * 1.1);
}

function onQuay(core: Core, clientX: number, clientY: number): boolean {
  const [nx, ny] = ndc(core, clientX, clientY);
  const p = core.cam.seaPoint(nx, ny);
  return p !== null && Math.abs(p[0] + 8) < 80 && p[1] < QZ + 16 && p[1] > QZ - 30;
}

function makeCore(canvas: HTMLCanvasElement, overlay: HTMLElement): Core {
  const view = createView(canvas);
  return {
    canvas, view, cam: new Camera(), fleet: new Fleet(), labels: new Labels(overlay, view.harbour.places),
    state: null, crates: [], t: 0, last: 0, raf: 0, hover: -1,
    motion: window.matchMedia('(prefers-reduced-motion: reduce)'), w: 0, h: 0,
  };
}

/** Throws when the browser has no WebGL: the caller falls back to the 2D chart. */
export function createScene3d(canvas: HTMLCanvasElement, overlay: HTMLElement): Scene3d {
  const core = makeCore(canvas, overlay);
  const onVisibility = (): void => { if (document.visibilityState === 'visible') { start(core); still(core); } };
  const onMotion = (): void => { start(core); still(core); };
  const onResize = (): void => { still(core); };
  document.addEventListener('visibilitychange', onVisibility);
  core.motion.addEventListener('change', onMotion);
  window.addEventListener('resize', onResize);
  start(core);
  return {
    setState(next: SceneState): void {
      const first = core.state === null;
      core.state = next;
      core.fleet.sync(next.boats, first || core.motion.matches);
      still(core);
    },
    emit(event: SceneEvent): void { applyEvent(core, event); still(core); },
    pick(clientX: number, clientY: number): Pick | null {
      const h = pickHull(core, clientX, clientY);
      if (h !== null) return { kind: 'boat', id: h.id };
      const g = groundAt(core, clientX, clientY);
      if (g >= 0) return { kind: 'zone', id: GROUNDS[g].id };
      return onQuay(core, clientX, clientY) ? { kind: 'quay' } : null;
    },
    hover(clientX: number, clientY: number): void {
      const r = canvas.getBoundingClientRect();
      core.cam.lean = [((clientX - r.left) / r.width) * 2 - 1, ((clientY - r.top) / r.height) * 2 - 1];
      core.hover = groundAt(core, clientX, clientY);
      still(core);
    },
    turn(dx: number, dy: number): void { core.cam.turn(-dx * 0.005, dy * 0.004); still(core); },
    zoom(d: number): void { core.cam.zoom(d * 0.25); still(core); },
    destroy(): void {
      window.cancelAnimationFrame(core.raf);
      core.raf = 0;
      document.removeEventListener('visibilitychange', onVisibility);
      core.motion.removeEventListener('change', onMotion);
      window.removeEventListener('resize', onResize);
      core.labels.clear();
    },
  };
}
