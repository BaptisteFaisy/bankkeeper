// scene.ts — the orchestrator of the 2D chart.
//
// One `requestAnimationFrame` for the whole scene, one state in, one
// picture out. The scene never decides anything: it draws what the
// state says and animates the difference between two states. The game
// keeps every action on the DOM controls; the canvas only shows.

import { loadPalette } from './palette';
import {
  CHEST_MARK, DROP_MARK, GULL_NESTS, MAP_H, MAP_W, STALL_MARKS, VIEW_H,
  VIEW_W, type ZoneKey,
} from './layout';
import { Fleet, type BoatModel } from './boats';
import {
  chestIsOpen, createFx, drawFx, drawGlows, fxChest, fxCrate, fxGull,
  fxSplash, fxStall, type FxState,
} from './fx';
import {
  drawCoast, drawFish, drawGulls, drawQuay, drawStalls, drawWater,
  drawZoneLabels, drawZoneTints, type SeaStall, type SeaZone,
} from './sea';
import { drawDial, drawHudBand, drawVeil, type HudView } from './hud';

export interface SceneState {
  boats: BoatModel[];
  zones: SeaZone[];
  stalls: SeaStall[];
  hud: HudView;
}

export type SceneEvent =
  | { type: 'land'; boatId: string }
  | { type: 'auction'; stall: number }
  | { type: 'chest' }
  | { type: 'splash'; x: number; y: number };

export interface Scene {
  setState(state: SceneState): void;
  emit(event: SceneEvent): void;
  destroy(): void;
}

interface Core {
  ctx: CanvasRenderingContext2D;
  fleet: Fleet;
  fx: FxState;
  motion: MediaQueryList;
  state: SceneState;
  wave: number;
  lastWave: number;
  clock: number;
  raf: number;
  running: boolean;
}

const EMPTY_HUD: HudView = {
  dayPhase: 0.2,
  dayLabel: 'Day',
  week: 1,
  auction: { active: false, price: 0, start: 1, endsAt: 0, buyer: -1, buyerName: '' },
  fund: { level: 0, amount: 0 },
  ledger: [],
};

const EMPTY_STATE: SceneState = { boats: [], zones: [], stalls: [], hud: EMPTY_HUD };

function contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const maybe = canvas.getContext('2d');
  if (maybe === null) throw new Error('scene: the browser gave no 2d context');
  return maybe;
}

function makeCore(canvas: HTMLCanvasElement): Core {
  loadPalette();
  const ctx = contextOf(canvas);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(VIEW_W * dpr);
  canvas.height = Math.round(VIEW_H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const core: Core = {
    ctx, fleet: new Fleet(), fx: createFx(), state: EMPTY_STATE,
    motion: window.matchMedia('(prefers-reduced-motion: reduce)'),
    wave: 0, lastWave: 0, clock: 0, raf: 0, running: false,
  };
  core.fleet.onArrive = (x: number, y: number): void => {
    fxSplash(core.fx, x, y, core.clock);
  };
  return core;
}

/** Paint everything the state says, at this instant. */
function paintScene(core: Core, now: number): void {
  const ctx = core.ctx;
  const state = core.state;
  const lit = state.hud.auction.active ? state.hud.auction.buyer : -1;
  core.clock = now;
  drawWater(ctx, core.wave);
  drawZoneTints(ctx, state.zones);
  drawFish(ctx, state.zones, core.wave);
  drawCoast(ctx, core.wave);
  drawGlows(ctx, core.fx, now);
  drawQuay(ctx, state.hud.fund.level, chestIsOpen(core.fx, now));
  drawStalls(ctx, state.stalls, lit);
  drawZoneLabels(ctx, state.zones);
  core.fleet.draw(ctx, now);
  drawFx(ctx, core.fx, now);
  drawGulls(ctx, GULL_NESTS, core.wave);
  drawVeil(ctx, state.hud.dayPhase);
  drawDial(ctx, state.hud);
  drawHudBand(ctx, state.hud, now);
}

/** The background runs at ~30 frames a second, the tweens at 60. */
function runFrame(core: Core, now: number): void {
  if (document.visibilityState !== 'visible') {
    core.running = false;
    return;
  }
  if (now - core.lastWave >= 33) {
    core.wave += 0.035 * ((now - core.lastWave) / 33);
    core.lastWave = now;
  }
  paintScene(core, now);
  core.raf = window.requestAnimationFrame((tick: number) => runFrame(core, tick));
}

function startLoop(core: Core): void {
  if (core.running || core.motion.matches) return;
  core.running = true;
  core.lastWave = performance.now();
  core.raf = window.requestAnimationFrame((tick: number) => runFrame(core, tick));
}

function stopLoop(core: Core): void {
  core.running = false;
  window.cancelAnimationFrame(core.raf);
}

/** With reduced motion: one still picture, repainted on every change. */
function stillFrame(core: Core): void {
  if (core.motion.matches) paintScene(core, performance.now());
}

function visibilityChanged(core: Core): void {
  if (document.visibilityState !== 'visible') {
    stopLoop(core);
    return;
  }
  startLoop(core);
  stillFrame(core);
}

function motionChanged(core: Core): void {
  stopLoop(core);
  startLoop(core);
  stillFrame(core);
}

/** One event, one tween: a landing, a sale, a paid motion, a splash. */
function applyEvent(core: Core, event: SceneEvent, now: number): void {
  if (event.type === 'land') {
    const from = core.fleet.mark(event.boatId);
    if (from !== null) fxCrate(core.fx, from.x, from.y, DROP_MARK.x, DROP_MARK.y, now);
    return;
  }
  if (event.type === 'auction') {
    fxStall(core.fx, event.stall, now);
    const mark = STALL_MARKS[event.stall];
    if (mark !== undefined) fxGull(core.fx, mark.x + 32, mark.y + 12, now);
    return;
  }
  if (event.type === 'chest') {
    fxChest(core.fx, CHEST_MARK.x, CHEST_MARK.y, now);
    return;
  }
  fxSplash(core.fx, event.x, event.y, now);
}

export function createScene(canvas: HTMLCanvasElement): Scene {
  const core = makeCore(canvas);
  const onVisibility = (): void => { visibilityChanged(core); };
  const onMotion = (): void => { motionChanged(core); };
  document.addEventListener('visibilitychange', onVisibility);
  core.motion.addEventListener('change', onMotion);
  startLoop(core);
  return {
    setState(next: SceneState): void {
      core.state = next;
      core.fleet.sync(next.boats, performance.now());
      stillFrame(core);
    },
    emit(event: SceneEvent): void {
      applyEvent(core, event, performance.now());
      stillFrame(core);
    },
    destroy(): void {
      stopLoop(core);
      document.removeEventListener('visibilitychange', onVisibility);
      core.motion.removeEventListener('change', onMotion);
    },
  };
}

export type { BoatModel, HudView, SeaStall, SeaZone, ZoneKey };
export { MAP_H, MAP_W };
