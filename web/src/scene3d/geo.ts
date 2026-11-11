// geo.ts — a tiny procedural geometry builder. Every vertex is x, y, z, e:
// on triangles e is the emissive weight (0 = matter, 1 = light), on lines
// it is the line intensity. No asset is loaded: the harbour is built here.

import type { Vec3 } from './math';

export interface Opts {
  /** Emissive weight of the faces. */
  e?: number;
  /** Intensity of the edges (scaled by Geo.EDGE). */
  i?: number;
  /** Roof ridge runs along z. */
  rz?: boolean;
  /** Top radius of a cylinder (0 = cone). */
  r2?: number;
  /** Rotation of a cylinder's first vertex. */
  rot?: number;
  /** Draw a cylinder's vertical seams. */
  v?: boolean;
}

const BOX_FACES = [[3, 2, 6, 7], [1, 0, 4, 5], [0, 3, 7, 4], [2, 1, 5, 6], [4, 7, 6, 5]];
const BOX_EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

export class Geo {
  /** Volumes carry the shape; edges are only a faint seam. */
  static EDGE = 0.22;
  t: number[] = [];
  l: number[] = [];
  private o: Vec3 = [0, 0, 0];
  private c = 1;
  private s = 0;

  /** Move and turn the local frame of the next primitives. */
  at(x: number, y: number, z: number, ry = 0): this {
    this.o = [x, y, z]; this.c = Math.cos(ry); this.s = Math.sin(ry);
    return this;
  }
  private p(v: Vec3): Vec3 {
    return [this.o[0] + v[0] * this.c - v[2] * this.s, this.o[1] + v[1], this.o[2] + v[0] * this.s + v[2] * this.c];
  }
  tri(a: Vec3, b: Vec3, c: Vec3, e = 0): void {
    for (const v of [a, b, c]) { const q = this.p(v); this.t.push(q[0], q[1], q[2], e); }
  }
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, e = 0): void { this.tri(a, b, c, e); this.tri(a, c, d, e); }
  line(a: Vec3, b: Vec3, i = 0.6): void {
    const p = this.p(a), q = this.p(b);
    this.l.push(p[0], p[1], p[2], i, q[0], q[1], q[2], i);
  }
  path(pts: Vec3[], i: number, closed = false): void {
    for (let k = 0; k < pts.length - 1; k++) this.line(pts[k], pts[k + 1], i);
    if (closed) this.line(pts[pts.length - 1], pts[0], i);
  }

  /** A box: x, z = centre, y = base. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, o: Opts = {}): this {
    const e = o.e ?? 0, i = (o.i ?? 0.6) * Geo.EDGE, a = w / 2, b = d / 2;
    const v: Vec3[] = [[x - a, y, z - b], [x + a, y, z - b], [x + a, y, z + b], [x - a, y, z + b],
      [x - a, y + h, z - b], [x + a, y + h, z - b], [x + a, y + h, z + b], [x - a, y + h, z + b]];
    for (const q of BOX_FACES) this.quad(v[q[0]], v[q[1]], v[q[2]], v[q[3]], e);
    if (i > 0) for (const q of BOX_EDGES) this.line(v[q[0]], v[q[1]], i);
    return this;
  }

  /** A triangular prism roof. rz = the ridge runs along z (the gable faces the sea). */
  roof(x: number, y: number, z: number, w: number, d: number, rh: number, o: Opts = {}): this {
    const i = (o.i ?? 0.6) * Geo.EDGE, a = w / 2 + 0.3, b = d / 2 + 0.3, e = o.e ?? 0;
    const A: Vec3 = [x - a, y, z - b], B: Vec3 = [x + a, y, z - b], C: Vec3 = [x + a, y, z + b], D: Vec3 = [x - a, y, z + b];
    const R1: Vec3 = o.rz ? [x, y + rh, z - b] : [x - a, y + rh, z];
    const R2: Vec3 = o.rz ? [x, y + rh, z + b] : [x + a, y + rh, z];
    if (o.rz) {
      this.quad(D, A, R1, R2, e); this.quad(B, C, R2, R1, e); this.tri(D, C, R2, e); this.tri(B, A, R1, e);
    } else {
      this.quad(D, C, R2, R1, e); this.quad(B, A, R1, R2, e); this.tri(A, D, R1, e); this.tri(C, B, R2, e);
    }
    if (i > 0) {
      this.path([A, B, C, D], i, true); this.line(R1, R2, i);
      const ends: Array<[Vec3, Vec3]> = o.rz ? [[A, R1], [B, R1], [C, R2], [D, R2]] : [[A, R1], [D, R1], [B, R2], [C, R2]];
      for (const q of ends) this.line(q[0], q[1], i);
    }
    return this;
  }

  gable(x: number, y: number, z: number, w: number, h: number, d: number, rh: number, o: Opts = {}): this {
    this.box(x, y, z, w, h, d, o);
    return this.roof(x, y + h, z, w, d, rh, o);
  }

  /** An n-gon cylinder, or a cone when r2 = 0. */
  cyl(x: number, y: number, z: number, r: number, h: number, n: number, o: Opts = {}): this {
    const e = o.e ?? 0, i = (o.i ?? 0.6) * Geo.EDGE, r2 = o.r2 ?? r;
    const lo: Vec3[] = [], hi: Vec3[] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (o.rot ?? 0);
      lo.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r]);
      hi.push([x + Math.cos(a) * r2, y + h, z + Math.sin(a) * r2]);
    }
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      this.quad(lo[k], lo[j], hi[j], hi[k], e);
      if (r2 > 0.01) this.tri([x, y + h, z], hi[k], hi[j], e);
      if (i > 0) {
        this.line(lo[k], lo[j], i); this.line(hi[k], hi[j], i);
        if (o.v) this.line(lo[k], hi[k], i * 0.7);
      }
    }
    return this;
  }

  /** A vertical ring of lines in the xy plane (a clock face). */
  ring(x: number, y: number, z: number, r: number, n: number, i: number): this {
    const p: Vec3[] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      p.push([x + Math.cos(a) * r, y + Math.sin(a) * r, z]);
    }
    this.path(p, i, true);
    return this;
  }

  /** A grid of windows on a wall facing +z; some lit, some dark. */
  wins(x: number, y: number, z: number, w: number, h: number, cols: number, rows: number, rnd: () => number, lit = 0.6): this {
    const cw = w / cols, rh = h / rows;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const cx = x - w / 2 + cw * (c + 0.5), cy = y + rh * r, ww = cw * 0.46, wh = rh * 0.62;
        const e = rnd() < lit ? 0.95 : 0.16;
        this.quad([cx - ww / 2, cy, z], [cx + ww / 2, cy, z], [cx + ww / 2, cy + wh, z], [cx - ww / 2, cy + wh, z], e);
      }
    }
    return this;
  }
}
