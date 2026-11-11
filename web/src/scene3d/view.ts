// view.ts — the GPU side of the harbour: programs, buffers and the passes
// of one frame (sky, volumes, sea, lines, light, bloom). It draws what the
// `Frame` says and decides nothing.

import * as S from './shaders';
import { buffer, draw, program, target, type Buffer, type Layout, type Program, type Target } from './glx';
import { IDENT, model, type Mat4, type Vec3 } from './math';
import { Geo } from './geo';
import { buildHarbour, type Harbour } from './harbour';
import { GROUNDS, buildBoat, buildWake, wave, type Hull } from './fleet';
import { rng } from './math';

export interface Crate { a: Vec3; b: Vec3; t0: number; dur: number }

export interface Frame {
  t: number;
  vp: Mat4;
  eye: Vec3;
  cam: { F: Vec3; R: Vec3; U: Vec3; tanX: number; tanY: number };
  hulls: Hull[];
  crates: Crate[];
  stock: [number, number, number];
  rest: [number, number, number];
  focus: [number, number, number, number];
  /** Highlighted ground: index, or -1. */
  hover: number;
}

const PF: Layout = [['aPos', 3], ['aE', 1]];
const P2: Layout = [['aPos', 2]];
const FF: Layout = [['aL', 2], ['aF', 4]];
export const CLIP: [number, number, number] = [-4, -36, 150];
export const BOAT_SCALE = 0.6;

function fishData(): number[] {
  const r = rng(77), out: number[] = [];
  const shape = [[1.3, 0], [0.2, 0.5], [-0.8, 0], [1.3, 0], [-0.8, 0], [0.2, -0.5], [-0.8, 0], [-1.5, 0.5], [-1.5, -0.5]];
  for (let b = 0; b < 3; b++) {
    for (let k = 0; k < 64; k++) {
      const rf = Math.sqrt(r()), a = r(), rank = (k + 0.5) / 64, sc = 0.5 + r() * 0.3;
      for (const s of shape) out.push(s[0] * sc, s[1] * sc, b, rf, a, rank);
    }
  }
  return out;
}

function plinth(): Geo {
  const g = new Geo();
  g.cyl(CLIP[0], -18, CLIP[1], CLIP[2], 17.6, 96, { i: 0, r2: CLIP[2] });
  const ring = (y: number, i: number): void => {
    for (let k = 0; k < 96; k++) {
      const a0 = (k / 96) * Math.PI * 2, a1 = ((k + 1) / 96) * Math.PI * 2;
      g.line([CLIP[0] + Math.cos(a0) * (CLIP[2] + 0.05), y, CLIP[1] + Math.sin(a0) * (CLIP[2] + 0.05)],
        [CLIP[0] + Math.cos(a1) * (CLIP[2] + 0.05), y, CLIP[1] + Math.sin(a1) * (CLIP[2] + 0.05)], i);
    }
  };
  ring(0.05, 1.2);
  ring(-18, 0.35);
  return g;
}

export interface View {
  gl: WebGLRenderingContext;
  harbour: Harbour;
  resize(w: number, h: number): void;
  paint(f: Frame): void;
}

export function createView(gl: WebGLRenderingContext): View {
  gl.getExtension('OES_standard_derivatives');
  const prog = {
    face: program(gl, S.FACE_V, S.FACE_F), flat: program(gl, S.FLAT_V, S.FLAT_F), water: program(gl, S.WATER_V, S.WATER_F),
    sky: program(gl, S.SKY_V, S.SKY_F), fish: program(gl, S.FISH_V, S.FISH_F), blur: program(gl, S.POST_V, S.BLUR_F), comp: program(gl, S.POST_V, S.COMP_F),
  };
  const harbour = buildHarbour();
  const boat = buildBoat(), base = plinth();
  const crate = new Geo().box(0, 0, 0, 1.5, 1.1, 1.2, { i: 1 });
  const R = CLIP[2] + 2;
  const buf: Record<string, Buffer> = {
    portT: buffer(gl, harbour.geo.t), portL: buffer(gl, harbour.geo.l), boatT: buffer(gl, boat.t), boatL: buffer(gl, boat.l),
    baseT: buffer(gl, base.t), baseL: buffer(gl, base.l), crateT: buffer(gl, crate.t), wake: buffer(gl, buildWake()),
    water: buffer(gl, [CLIP[0] - R, 0, CLIP[1] - R, CLIP[0] + R, 0, CLIP[1] - R, CLIP[0] + R, 0, CLIP[1] + R, CLIP[0] - R, 0, CLIP[1] - R, CLIP[0] + R, 0, CLIP[1] + R, CLIP[0] - R, 0, CLIP[1] + R]),
    quad: buffer(gl, [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]),
    beam: buffer(gl, [0, 0, 0, 0.22, 120, 4, -3.5, 0, 120, 4, 3.5, 0, 0, 0, 0, 0.16, -120, 4, -3.5, 0, -120, 4, 3.5, 0]),
    fish: buffer(gl, fishData()),
  };
  const fb: { a: Target | null; b: Target | null; w: number; h: number } = { a: null, b: null, w: 1, h: 1 };
  const ctx: Ctx = { gl, prog, buf, harbour };
  return {
    gl, harbour,
    resize(w: number, h: number): void {
      fb.w = w; fb.h = h;
      fb.a = target(gl, Math.max(1, w >> 1), Math.max(1, h >> 1));
      fb.b = target(gl, Math.max(1, w >> 1), Math.max(1, h >> 1));
    },
    paint(f: Frame): void { paintFrame(ctx, fb, f); },
  };
}

interface Ctx { gl: WebGLRenderingContext; prog: Record<string, Program>; buf: Record<string, Buffer>; harbour: Harbour }

function use(ctx: Ctx, P: Program, f: Frame, glow: boolean): Program {
  const gl = ctx.gl, u = P.u;
  gl.useProgram(P.p);
  if (u.uVP) gl.uniformMatrix4fv(u.uVP, false, f.vp);
  if (u.uCam) gl.uniform3fv(u.uCam, f.eye);
  if (u.uT) gl.uniform1f(u.uT, f.t);
  if (u.uGlow) gl.uniform1f(u.uGlow, glow ? 1 : 0);
  if (u.uBank) gl.uniform4fv(u.uBank, GROUNDS.flatMap((g, i) => [g.x, g.z, g.r, f.stock[i]]));
  if (u.uRest) gl.uniform3fv(u.uRest, f.rest);
  if (u.uFocus) gl.uniform4fv(u.uFocus, f.focus);
  if (u.uClip) gl.uniform3fv(u.uClip, CLIP);
  if (u.uPick) gl.uniform4f(u.uPick, f.hover >= 0 ? 1 : 0, f.hover, 0, 0);
  return P;
}

const hullMatrix = (b: Hull, t: number): Mat4 =>
  model(b.x, wave(b.x, b.z, t) + 0.1, b.z, b.h, Math.sin(t * 0.9 + b.seat) * 0.025, Math.sin(t * 0.7 + b.seat * 2) * 0.04, BOAT_SCALE);

function crateMatrix(c: Crate, t: number): Mat4 {
  const p = Math.max(0, Math.min(1, (t - c.t0) / c.dur)), q = p * p * (3 - 2 * p);
  return model(c.a[0] + (c.b[0] - c.a[0]) * q, c.a[1] + (c.b[1] - c.a[1]) * q + Math.sin(p * Math.PI) * 9, c.a[2] + (c.b[2] - c.a[2]) * q, p * 3, 0, 0, 1);
}

function solids(ctx: Ctx, f: Frame, glow: boolean): void {
  const gl = ctx.gl, P = use(ctx, ctx.prog.face, f, glow);
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(1, 1);
  gl.uniformMatrix4fv(P.u.uM, false, IDENT);
  gl.uniform1f(P.u.uLit, 0);
  gl.uniform1f(P.u.uDim, 0);
  draw(gl, P, ctx.buf.portT, PF, gl.TRIANGLES);
  draw(gl, P, ctx.buf.baseT, PF, gl.TRIANGLES);
  for (const b of f.hulls) {
    gl.uniformMatrix4fv(P.u.uM, false, hullMatrix(b, f.t));
    gl.uniform1f(P.u.uLit, b.mine ? (b.selected ? 0.55 : 0.3) : 0);
    gl.uniform1f(P.u.uDim, b.disarmed ? 1 : 0);
    draw(gl, P, ctx.buf.boatT, PF, gl.TRIANGLES);
  }
  gl.uniform1f(P.u.uLit, 1);
  gl.uniform1f(P.u.uDim, 0);
  for (const c of f.crates) {
    if (f.t < c.t0) continue;
    gl.uniformMatrix4fv(P.u.uM, false, crateMatrix(c, f.t));
    draw(gl, P, ctx.buf.crateT, PF, gl.TRIANGLES);
  }
  gl.disable(gl.POLYGON_OFFSET_FILL);
  draw(gl, use(ctx, ctx.prog.water, f, glow), ctx.buf.water, [['aPos', 3]], gl.TRIANGLES);
}

function lines(ctx: Ctx, f: Frame, glow: boolean): void {
  const gl = ctx.gl, P = use(ctx, ctx.prog.flat, f, glow);
  gl.uniform1f(P.u.uMode, 0);
  gl.uniformMatrix4fv(P.u.uM, false, IDENT);
  gl.uniform1f(P.u.uA, 1);
  draw(gl, P, ctx.buf.portL, PF, gl.LINES);
  draw(gl, P, ctx.buf.baseL, PF, gl.LINES);
  for (const b of f.hulls) {
    gl.uniformMatrix4fv(P.u.uM, false, hullMatrix(b, f.t));
    gl.uniform1f(P.u.uA, b.disarmed ? 0.15 : b.mine ? 1.5 : 0.55);
    draw(gl, P, ctx.buf.boatL, PF, gl.LINES);
  }
}

function light(ctx: Ctx, f: Frame, glow: boolean): void {
  const gl = ctx.gl;
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.depthMask(false);
  draw(gl, use(ctx, ctx.prog.fish, f, glow), ctx.buf.fish, FF, gl.TRIANGLES);
  const P = use(ctx, ctx.prog.flat, f, glow);
  gl.uniform1f(P.u.uMode, 1);
  for (const b of f.hulls) {
    if (b.v < 1) continue;
    gl.uniformMatrix4fv(P.u.uM, false, model(b.x, 0, b.z, b.h, 0, 0, BOAT_SCALE));
    gl.uniform1f(P.u.uA, Math.min(1, b.v / 12) * 0.5);
    draw(gl, P, ctx.buf.wake, PF, gl.TRIANGLES);
  }
  const L = ctx.harbour.light;
  gl.uniformMatrix4fv(P.u.uM, false, model(L[0], L[1] - 2, L[2], f.t * 0.45, 0, 0, 1));
  gl.uniform1f(P.u.uA, 0.8);
  draw(gl, P, ctx.buf.beam, PF, gl.TRIANGLES);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

function scenePass(ctx: Ctx, f: Frame, t: Target | null, w: number, h: number, glow: boolean): void {
  const gl = ctx.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, t === null ? null : t.fb);
  gl.viewport(0, 0, t === null ? w : t.w, t === null ? h : t.h);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (!glow) {
    gl.disable(gl.DEPTH_TEST);
    const P = use(ctx, ctx.prog.sky, f, false);
    gl.uniform3fv(P.u.uF, f.cam.F);
    gl.uniform3fv(P.u.uR, f.cam.R);
    gl.uniform3fv(P.u.uU, f.cam.U);
    gl.uniform2f(P.u.uTan, f.cam.tanX, f.cam.tanY);
    draw(gl, P, ctx.buf.quad, P2, gl.TRIANGLES);
  }
  gl.enable(gl.DEPTH_TEST);
  solids(ctx, f, glow);
  lines(ctx, f, glow);
  light(ctx, f, glow);
}

function blur(ctx: Ctx, src: Target, dst: Target, dx: number, dy: number): void {
  const gl = ctx.gl, P = ctx.prog.blur;
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
  gl.viewport(0, 0, dst.w, dst.h);
  gl.useProgram(P.p);
  gl.bindTexture(gl.TEXTURE_2D, src.tex);
  gl.uniform2f(P.u.uDir, dx / src.w, dy / src.h);
  draw(gl, P, ctx.buf.quad, P2, gl.TRIANGLES);
}

function paintFrame(ctx: Ctx, fb: { a: Target | null; b: Target | null; w: number; h: number }, f: Frame): void {
  const gl = ctx.gl;
  scenePass(ctx, f, null, fb.w, fb.h, false);
  if (fb.a === null || fb.b === null) return;
  scenePass(ctx, f, fb.a, fb.w, fb.h, true);
  gl.disable(gl.DEPTH_TEST);
  blur(ctx, fb.a, fb.b, 1, 0); blur(ctx, fb.b, fb.a, 0, 1);
  blur(ctx, fb.a, fb.b, 2.6, 0); blur(ctx, fb.b, fb.a, 0, 2.6);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, fb.w, fb.h);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  const P = ctx.prog.comp;
  gl.useProgram(P.p);
  gl.bindTexture(gl.TEXTURE_2D, fb.a.tex);
  gl.uniform1f(P.u.uK, 0.7);
  draw(gl, P, ctx.buf.quad, P2, gl.TRIANGLES);
  gl.disable(gl.BLEND);
}
