// harbour.ts — the port of Tidewater, built from primitives. One quay, the
// criée, three merchants, the council, the port fund, a crane, a town on
// three terraces, a breakwater and its lighthouse. The sea is +z.

import { Geo } from './geo';
import { rng, type Vec3 } from './math';

export const QZ = -72;
export const QY = 3;

export interface Place { id: string; text: string; pos: Vec3 }

export interface Harbour {
  geo: Geo;
  places: Place[];
  /** Where landed crates fly to. */
  hall: Vec3;
  /** The lantern of the lighthouse. */
  light: Vec3;
}

const LIGHT: Vec3 = [84, 21.5, -38];

function coast(g: Geo): void {
  g.box(-8, -3, QZ - 4, 146, QY + 3, 8, { i: 0.85 });
  for (const y of [0.4, 1.3, 2.2]) g.line([-81, y, QZ + 0.02], [65, y, QZ + 0.02], 0.22);
  for (let x = -78; x <= 62; x += 7) g.line([x, -0.4, QZ + 0.02], [x, QY, QZ + 0.02], 0.12);
  g.box(-8, -3, QZ - 26, 150, QY + 3, 36, { i: 0 });
  g.box(-8, -3, QZ - 54, 170, QY + 7, 26, { i: 0.25 });
  g.box(-8, -3, QZ - 84, 190, QY + 11, 36, { i: 0.25 });
  g.box(-300, -3, QZ - 60, 440, 4.4, 110, { i: 0.3 });
  g.box(290, -3, QZ - 60, 440, 4.4, 110, { i: 0.3 });
  const hills: Array<[number, number, number]> = [[-260, 60, 34], [-150, 80, 22], [-40, 120, 40], [90, 90, 28], [210, 110, 44], [340, 70, 24]];
  for (const h of hills) g.roof(h[0], 1, QZ - 150, h[1] * 2, 120, h[2], { i: 0.3 });
}

function quayFurniture(g: Geo): void {
  for (let x = -76; x <= 62; x += 12) {
    g.line([x, QY, QZ - 0.8], [x, QY + 5.2, QZ - 0.8], 0.5);
    g.line([x, QY + 5.2, QZ - 0.8], [x, QY + 5.2, QZ + 0.2], 0.5);
    g.box(x, QY + 4.7, QZ + 0.2, 0.6, 0.5, 0.6, { e: 1, i: 0 });
  }
  for (let x = -70; x <= 58; x += 6.5) g.cyl(x, QY, QZ - 0.6, 0.32, 0.7, 6, { i: 0.5 });
  for (const x of [-52, -4, 44]) {
    g.line([x - 0.4, -0.6, QZ + 0.06], [x - 0.4, QY + 0.8, QZ + 0.06], 0.6);
    g.line([x + 0.4, -0.6, QZ + 0.06], [x + 0.4, QY + 0.8, QZ + 0.06], 0.6);
    for (let y = -0.2; y < QY; y += 0.6) g.line([x - 0.4, y, QZ + 0.06], [x + 0.4, y, QZ + 0.06], 0.45);
  }
  const r = rng(11);
  for (let k = 0; k < 16; k++) {
    const x = -68 + r() * 126, z = QZ - 2.2 - r() * 1.6;
    if (r() < 0.6) {
      g.box(x, QY, z, 1.3, 0.9, 1, { i: 0.45 });
      if (r() < 0.5) g.box(x + 0.15, QY + 0.9, z, 1.3, 0.9, 1, { i: 0.45 });
    } else g.cyl(x, QY, z, 0.5, 1.1, 7, { i: 0.4 });
  }
}

function cannery(g: Geo, places: Place[]): void {
  const x = -60, z = QZ - 13, w = 24, h = 10, d = 14, r = rng(3);
  g.box(x, QY, z, w, h, d, { i: 0.7 });
  for (let k = 0; k < 4; k++) {
    const x0 = x - w / 2 + k * 6, y = QY + h;
    const a: Vec3 = [x0, y, z - d / 2], b: Vec3 = [x0, y, z + d / 2], c: Vec3 = [x0, y + 3.4, z + d / 2], e: Vec3 = [x0, y + 3.4, z - d / 2];
    const f: Vec3 = [x0 + 6, y, z + d / 2], k2: Vec3 = [x0 + 6, y, z - d / 2];
    g.quad(a, b, c, e, 0.42); g.quad(e, c, f, k2, 0); g.tri(b, f, c, 0); g.tri(a, k2, e, 0);
    g.path([b, c, f], 0.7, true); g.line(c, e, 0.7); g.line(e, k2, 0.4);
  }
  g.wins(x, QY + 5.6, z + d / 2 + 0.06, w - 3, 3.6, 8, 1, r, 0.8);
  for (const dx of [-6, 4]) {
    const zz = z + d / 2 + 0.06;
    g.quad([x + dx - 2, QY, zz], [x + dx + 2, QY, zz], [x + dx + 2, QY + 4, zz], [x + dx - 2, QY + 4, zz], 0.3);
  }
  g.cyl(-76, QY, z - 2, 1.7, 27, 10, { r2: 1.15, i: 0.7 });
  for (const y of [9, 16, 23, 26.4]) g.cyl(-76, QY + y, z - 2, 1.75 - y * 0.02, 0.3, 10, { r2: 1.72 - y * 0.02, i: 0.8 });
  places.push({ id: 'cannery', text: 'Cannery', pos: [x, QY + h + 7, z] });
}

function auctionHall(g: Geo, places: Place[]): Vec3 {
  const x = -13, z = QZ - 10, w = 30, d = 12, h = 5.4;
  g.box(x, QY, z, w, 0.25, d, { i: 0.5 });
  g.box(x, QY, z - d / 2 + 0.3, w, h, 0.6, { e: 0.36, i: 0.4 });
  for (let k = 0; k <= 6; k++) g.box(x - w / 2 + 0.4 + (k * (w - 0.8)) / 6, QY, z + d / 2 - 0.4, 0.55, h, 0.55, { i: 0.75 });
  g.box(x - w / 2 + 0.3, QY, z, 0.6, h, d, { i: 0.5 });
  g.box(x + w / 2 - 0.3, QY, z, 0.6, h, d, { i: 0.5 });
  g.roof(x, QY + h, z, w, d, 3.6, { i: 0.8 });
  g.box(x, QY + h + 0.2, z + d / 2 + 0.1, 5.2, 4.6, 0.4, { i: 0.7 });
  g.ring(x, QY + h + 2.5, z + d / 2 + 0.36, 1.8, 20, 1);
  g.ring(x, QY + h + 2.5, z + d / 2 + 0.36, 1.45, 20, 0.4);
  g.line([x, QY + h + 2.5, z + d / 2 + 0.36], [x + 0.9, QY + h + 3.6, z + d / 2 + 0.36], 1);
  for (let k = 0; k < 5; k++) g.box(x - 10 + k * 5, QY + 0.25, z + 1, 2.6, 0.8, 1.4, { i: 0.55 });
  places.push({ id: 'auction', text: 'Auction', pos: [x, QY + h + 8.5, z] });
  return [x, QY + 1.5, z + 2];
}

function fishmonger(g: Geo, places: Place[]): void {
  const x = -37, z = QZ - 9, r = rng(5);
  g.gable(x, QY, z, 9, 6, 8, 3.2, { rz: true, i: 0.7 });
  g.wins(x, QY + 3.6, z + 4.06, 7, 2, 3, 1, r, 0.9);
  const aw: Vec3[] = [[x - 4.4, QY + 3.1, z + 4.05], [x + 4.4, QY + 3.1, z + 4.05], [x + 4.4, QY + 2.3, z + 6.2], [x - 4.4, QY + 2.3, z + 6.2]];
  g.quad(aw[0], aw[1], aw[2], aw[3], 0.5);
  g.path(aw, 0.9, true);
  g.quad([x - 3.6, QY, z + 4.06], [x + 3.6, QY, z + 4.06], [x + 3.6, QY + 2.2, z + 4.06], [x - 3.6, QY + 2.2, z + 4.06], 0.6);
  g.box(x, QY, z + 5.4, 6.4, 0.9, 1.2, { i: 0.6 });
  places.push({ id: 'fishmonger', text: 'Fishmonger', pos: [x, QY + 12, z] });
}

function gull(g: Geo, places: Place[]): void {
  const x = 13, z = QZ - 10, r = rng(7);
  g.gable(x, QY, z, 11, 8.4, 10, 4, { rz: true, i: 0.7 });
  g.wins(x, QY + 1, z + 5.06, 9, 7, 4, 3, r, 0.85);
  g.quad([x - 1, QY + 9, z + 5.06], [x + 1, QY + 9, z + 5.06], [x + 1, QY + 10.6, z + 5.06], [x - 1, QY + 10.6, z + 5.06], 0.9);
  g.box(x + 3.6, QY + 8.4, z - 2, 1.2, 4.6, 1.2, { i: 0.6 });
  g.line([x - 5.5, QY + 6, z + 5.1], [x - 5.5, QY + 6, z + 7], 0.8);
  g.box(x - 5.5, QY + 4.4, z + 6.6, 0.15, 1.5, 1.6, { e: 0.55, i: 0.9 });
  places.push({ id: 'gull', text: 'The Gull', pos: [x, QY + 15.5, z] });
}

function council(g: Geo, places: Place[]): void {
  const x = 38, z = QZ - 12, r = rng(9);
  g.box(x, QY, z, 16, 8.5, 10, { i: 0.7 });
  g.roof(x, QY + 8.5, z, 16, 10, 3.4, { i: 0.7 });
  g.wins(x, QY + 1.2, z + 5.06, 14, 6.6, 6, 2, r, 0.7);
  g.box(x, QY, z + 4.2, 4.4, 17, 4.4, { i: 0.8 });
  g.ring(x, QY + 14, z + 6.46, 1.5, 18, 1);
  g.line([x, QY + 14, z + 6.46], [x, QY + 15.1, z + 6.46], 1);
  g.line([x, QY + 14, z + 6.46], [x + 0.7, QY + 13.6, z + 6.46], 1);
  g.cyl(x, QY + 17, z + 4.2, 3.2, 6.5, 4, { r2: 0, rot: Math.PI / 4, i: 0.8 });
  g.line([x, QY + 23.5, z + 4.2], [x, QY + 26.5, z + 4.2], 0.9);
  g.box(x, QY + 26.3, z + 4.2, 0.4, 0.4, 0.4, { e: 1, i: 0 });
  for (let k = 0; k < 4; k++) g.box(x - 6 + k * 4, QY, z + 5.6, 0.5, 4.2, 0.5, { i: 0.6 });
  places.push({ id: 'council', text: 'Council', pos: [x, QY + 30, z + 4] });
}

function fundChest(g: Geo, places: Place[]): void {
  g.box(4.5, QY, QZ - 2.6, 2.6, 1.5, 1.7, { i: 0.9 });
  g.box(4.5, QY + 0.55, QZ - 2.6, 2.7, 0.35, 1.8, { e: 0.85, i: 0 });
  g.cyl(4.5, QY + 1.5, QZ - 2.6, 0.9, 0.5, 6, { r2: 0.6, i: 0.7 });
  places.push({ id: 'fund', text: 'Port fund', pos: [4.5, QY + 5, QZ - 2.6] });
}

function craneTower(g: Geo, x: number, z: number, top: number): void {
  const legs: Array<[number, number]> = [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]];
  for (let k = 0; k < 4; k++) {
    const a = legs[k], b = legs[(k + 1) % 4];
    g.line([x + a[0], QY, z + a[1]], [x + a[0] * 0.5, top, z + a[1] * 0.5], 0.8);
    for (let s = 0; s < 5; s++) {
      const t0 = s / 5, t1 = (s + 1) / 5, f0 = 1 - t0 * 0.5, f1 = 1 - t1 * 0.5, y0 = QY + t0 * 12, y1 = QY + t1 * 12;
      g.line([x + a[0] * f0, y0, z + a[1] * f0], [x + b[0] * f1, y1, z + b[1] * f1], 0.4);
      g.line([x + a[0] * f1, y1, z + a[1] * f1], [x + b[0] * f1, y1, z + b[1] * f1], 0.4);
    }
  }
}

function crane(g: Geo): void {
  const x = 25, z = QZ - 3.4, top = QY + 15;
  craneTower(g, x, z, top);
  g.box(x, top - 1.5, z, 3.2, 2.6, 3.2, { i: 0.8 });
  g.wins(x, top - 0.9, z + 1.66, 2.6, 1.6, 2, 1, rng(2), 1);
  const tip: Vec3 = [x - 4, top + 9, z + 17], heel: Vec3 = [x, top + 1, z + 1];
  for (const dx of [-0.6, 0.6]) g.line([heel[0] + dx, heel[1], heel[2]], [tip[0] + dx * 0.3, tip[1], tip[2]], 0.9);
  const at = (q: number, dx: number): Vec3 => [heel[0] + (tip[0] - heel[0]) * q + dx * (1 - q * 0.7), heel[1] + (tip[1] - heel[1]) * q, heel[2] + (tip[2] - heel[2]) * q];
  for (let s = 0; s < 8; s++) {
    g.line(at(s / 8, -0.6), at((s + 1) / 8, 0.6), 0.45);
    g.line(at(s / 8, 0.6), at((s + 1) / 8, -0.6), 0.45);
  }
  g.line([x, top + 5, z - 1], tip, 0.6);
  g.line([x, top + 1, z], [x, top + 5, z - 1], 0.8);
  g.line(tip, [tip[0], QY + 6, tip[2]], 0.7);
  g.box(tip[0], QY + 4.8, tip[2], 1.2, 1.2, 1.2, { i: 0.9 });
}

function town(g: Geo): void {
  const r = rng(42);
  const rows: Array<[number, number, number]> = [[QZ - 30, QY, 0.55], [QZ - 50, QY + 4, 0.5], [QZ - 76, QY + 8, 0.42]];
  for (const row of rows) {
    let x = -84 + r() * 4;
    while (x < 70) {
      const w = 6 + r() * 4, h = 4.5 + r() * 4.5, d = 7 + r() * 2, rz = r() < 0.55;
      g.gable(x + w / 2, row[1], row[0], w, h, d, 2.4 + r() * 1.6, { rz, i: row[2] });
      g.wins(x + w / 2, row[1] + 1.2, row[0] + d / 2 + 0.06, w - 1.6, h - 1.4, 2 + (w > 8 ? 1 : 0), h > 6.5 ? 2 : 1, r, 0.5);
      if (r() < 0.5) g.box(x + w * 0.75, row[1] + h, row[0] - 1, 0.9, 3.4, 0.9, { i: row[2] });
      x += w + 0.8 + r() * 3.5;
    }
  }
  const cx = -22, cz = QZ - 80, cy = QY + 8;
  g.gable(cx, cy, cz, 9, 8, 18, 5, { rz: true, i: 0.55 });
  g.box(cx, cy, cz + 10, 5, 16, 5, { i: 0.6 });
  g.cyl(cx, cy + 16, cz + 10, 3.6, 12, 4, { r2: 0, rot: Math.PI / 4, i: 0.7 });
  g.quad([cx - 0.7, cy + 9, cz + 12.56], [cx + 0.7, cy + 9, cz + 12.56], [cx + 0.7, cy + 12.5, cz + 12.56], [cx - 0.7, cy + 12.5, cz + 12.56], 0.9);
}

function breakwater(g: Geo): void {
  const pts: Array<[number, number]> = [[65, QZ - 2], [72, QZ + 8], [78, QZ + 18], [82, QZ + 27], [84, QZ + 34]];
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    g.at((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2, Math.atan2(dz, dx));
    g.box(0, -3, 0, len + 2.4, 5.2, 5.5, { i: 0.7 }).box(0, 2.2, -2, len + 2.4, 0.9, 0.8, { i: 0.4 });
    g.at(0, 0, 0, 0);
  }
  const [x, , z] = LIGHT;
  g.cyl(x, 2.2, z, 3.4, 1.2, 10, { i: 0.7 });
  g.cyl(x, 3.4, z, 2.3, 14, 10, { r2: 1.5, i: 0.8 });
  for (const y of [7, 10.5, 14]) g.cyl(x, y, z, 2.35 - (y - 3.4) * 0.057, 0.25, 10, { r2: 2.33 - (y - 3.4) * 0.057, i: 0.9 });
  g.cyl(x, 17.4, z, 2.3, 0.4, 10, { i: 0.9 });
  g.cyl(x, 17.8, z, 1.25, 2.2, 8, { e: 0.95, i: 0.9, v: true });
  g.cyl(x, 20, z, 1.7, 1.8, 8, { r2: 0, i: 0.9 });
  g.box(-84, -3, QZ + 4, 5, 5, 16, { i: 0.7 });
  g.cyl(-84, 2, QZ + 10, 0.5, 5, 6, { i: 0.7 });
  g.box(-84, 7, QZ + 10, 0.8, 0.8, 0.8, { e: 1, i: 0 });
}

export function buildHarbour(): Harbour {
  const g = new Geo();
  const places: Place[] = [];
  coast(g);
  quayFurniture(g);
  cannery(g, places);
  const hall = auctionHall(g, places);
  fishmonger(g, places);
  gull(g, places);
  council(g, places);
  fundChest(g, places);
  crane(g);
  town(g);
  breakwater(g);
  return { geo: g, places, hall, light: LIGHT };
}
