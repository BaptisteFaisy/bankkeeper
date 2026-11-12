// camera.ts — an orbit around the harbour, low over the water. Move the mouse to lean, drag to
// turn, wheel to come closer. Everything eases; nothing snaps.

import { cross, lookAt, mul, norm, persp, sub, type Mat4, type Vec3 } from './math';

export interface Orbit { yaw: number; pitch: number; dist: number; tx: number; tz: number }

export const HOME: Orbit = { yaw: -0.42, pitch: 0.27, dist: 235, tx: 4, tz: -22 };
/** The eye orbits a point of the sea but looks a little above it, to keep the sky in the picture. */
const LOOK_Y = 15;
export const FOV = 0.6;
export const NEAR = 2;
export const FAR = 9000;

export class Camera {
  now: Orbit = { ...HOME };
  goal: Orbit = { ...HOME };
  lean: [number, number] = [0, 0];
  eye: Vec3 = [0, 0, 0];
  vp: Mat4 = [];
  F: Vec3 = [0, 0, -1];
  R: Vec3 = [1, 0, 0];
  U: Vec3 = [0, 1, 0];
  tanY = Math.tan(FOV / 2);
  aspect = 1.6;

  go(o: Partial<Orbit>): void { Object.assign(this.goal, o); }

  turn(dyaw: number, dpitch: number): void {
    this.goal.yaw = Math.max(-1.2, Math.min(1.4, this.goal.yaw + dyaw));
    this.goal.pitch = Math.max(0.12, Math.min(1.15, this.goal.pitch + dpitch));
  }

  zoom(d: number): void { this.goal.dist = Math.max(90, Math.min(420, this.goal.dist + d)); }

  update(dt: number, instant: boolean): void {
    const k = instant ? 1 : Math.min(1, dt * 2.2);
    const keys: Array<keyof Orbit> = ['yaw', 'pitch', 'dist', 'tx', 'tz'];
    for (const key of keys) this.now[key] += (this.goal[key] - this.now[key]) * k;
    const yaw = this.now.yaw + this.lean[0] * 0.05;
    const pitch = Math.max(0.08, this.now.pitch - this.lean[1] * 0.03);
    const t: Vec3 = [this.now.tx, 0, this.now.tz], cp = Math.cos(pitch);
    this.eye = [t[0] + Math.sin(yaw) * cp * this.now.dist, Math.sin(pitch) * this.now.dist, t[2] + Math.cos(yaw) * cp * this.now.dist];
    const look: Vec3 = [t[0], LOOK_Y, t[2]];
    this.F = norm(sub(look, this.eye));
    this.R = norm(cross(this.F, [0, 1, 0]));
    this.U = cross(this.R, this.F);
    const p = persp(FOV, this.aspect, NEAR, FAR);
    p[8] = this.shift;
    this.vp = mul(p, lookAt(this.eye, look, [0, 1, 0]));
  }

  /** Lens shift in NDC: the picture slides left to leave room for the deck. */
  shift = 0;

  /** The ray under a screen point (NDC), hitting the sea plane y = 0. */
  seaPoint(sx: number, ny: number): [number, number] | null {
    const nx = sx + this.shift;
    const d = norm([
      this.F[0] + this.R[0] * nx * this.tanY * this.aspect + this.U[0] * ny * this.tanY,
      this.F[1] + this.R[1] * nx * this.tanY * this.aspect + this.U[1] * ny * this.tanY,
      this.F[2] + this.R[2] * nx * this.tanY * this.aspect + this.U[2] * ny * this.tanY,
    ]);
    if (d[1] >= -1e-4) return null;
    const s = -this.eye[1] / d[1];
    return [this.eye[0] + d[0] * s, this.eye[2] + d[2] * s];
  }
}
