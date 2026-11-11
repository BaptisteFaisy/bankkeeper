// math.ts — the few 4×4 and vector helpers the harbour needs. Column-major,
// as WebGL expects. No allocation in the hot paths beyond the result array.

export type Vec3 = [number, number, number];
export type Mat4 = number[];

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function persp(fov: number, aspect: number, near: number, far: number): Mat4 {
  const t = 1 / Math.tan(fov / 2);
  return [t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
}

export function lookAt(eye: Vec3, centre: Vec3, up: Vec3): Mat4 {
  const f = norm(sub(centre, eye));
  const s = norm(cross(f, up));
  const t = cross(s, f);
  return [s[0], t[0], -f[0], 0, s[1], t[1], -f[1], 0, s[2], t[2], -f[2], 0, -dot(s, eye), -dot(t, eye), dot(f, eye), 1];
}

export function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Array<number>(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

export const IDENT: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Model matrix: forward (+x local) points to (cos yaw, 0, sin yaw). */
export function model(x: number, y: number, z: number, yaw: number, pitch: number, roll: number, s: number): Mat4 {
  const c = Math.cos(yaw), sn = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const ry = [c, 0, sn, 0, 0, 1, 0, 0, -sn, 0, c, 0, x, y, z, 1];
  const rz = [cp, sp, 0, 0, -sp, cp, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const rx = [1, 0, 0, 0, 0, cr, sr, 0, 0, -sr, cr, 0, 0, 0, 0, 1];
  const sc = [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1];
  return mul(mul(mul(ry, rz), rx), sc);
}

/** World point → normalised device coordinates, plus w (behind the eye when w <= 0). */
export function project(m: Mat4, p: Vec3): Vec3 {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  return [x / w, y / w, w];
}

/** A seeded generator, so the town looks the same on every load. */
export function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
