// mesh.ts — from the procedural builder (`Geo`) to lit meshes. Triangles are
// sorted by what they are made of (a `Classify` decides from the slope, the
// emissive weight and the place), then box-mapped so textures tile at the
// same scale everywhere. Strong lines become tubes: masts, booms, posts.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Geo } from './geo';
import type { Mats } from './matter';

/** up = |normal.y| of the face, e = its emissive weight, mid = its centre. Null drops the face. */
export type Classify = (up: number, e: number, mid: THREE.Vector3) => string | null;

interface Bin { p: number[]; uv: number[] }

function boxUv(n: THREE.Vector3, v: THREE.Vector3, s: number, uv: number[]): void {
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  if (ay >= ax && ay >= az) uv.push(v.x * s, v.z * s);
  else if (ax > az) uv.push(v.z * s, v.y * s);
  else uv.push(v.x * s, v.y * s);
}

function sort(geo: Geo, classify: Classify, uvScale: number): Map<string, Bin> {
  const t = geo.t, bins = new Map<string, Bin>();
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const n = new THREE.Vector3(), mid = new THREE.Vector3();
  for (let k = 0; k + 11 < t.length; k += 12) {
    for (let c = 0; c < 3; c++) v[c].set(t[k + c * 4], t[k + c * 4 + 1], t[k + c * 4 + 2]);
    n.subVectors(v[1], v[0]).cross(mid.subVectors(v[2], v[0])).normalize();
    mid.copy(v[0]).add(v[1]).add(v[2]).multiplyScalar(1 / 3);
    const key = classify(Math.abs(n.y), t[k + 3], mid);
    if (key === null) continue;
    let bin = bins.get(key);
    if (bin === undefined) { bin = { p: [], uv: [] }; bins.set(key, bin); }
    for (const q of v) { bin.p.push(q.x, q.y, q.z); boxUv(n, q, uvScale, bin.uv); }
  }
  return bins;
}

/** One mesh per material; every mesh casts and receives shadows. */
export function solid(geo: Geo, classify: Classify, mats: Mats, uvScale: number): THREE.Group {
  const group = new THREE.Group();
  for (const [key, bin] of sort(geo, classify, uvScale)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(bin.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(bin.uv, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats[key]);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

function tube(p: THREE.Vector3, q: THREE.Vector3, radius: number): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(q, p), len = d.length();
  const g = new THREE.CylinderGeometry(radius, radius, len, 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
  return g;
}

/** Lines at or above `min` become tubes; with `hair`, the lighter ones stay as thin rigging. */
export function rigging(geo: Geo, min: number, radius: number, tubeMat: THREE.Material, hair: number | null): THREE.Group {
  const l = geo.l, tubes: THREE.BufferGeometry[] = [], thin: number[] = [];
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  for (let k = 0; k + 7 < l.length; k += 8) {
    p.set(l[k], l[k + 1], l[k + 2]);
    q.set(l[k + 4], l[k + 5], l[k + 6]);
    if (l[k + 3] >= min) tubes.push(tube(p, q, radius));
    else if (l[k + 3] > 0.07) thin.push(p.x, p.y, p.z, q.x, q.y, q.z);
  }
  const group = new THREE.Group();
  if (tubes.length > 0) {
    const mesh = new THREE.Mesh(mergeGeometries(tubes), tubeMat);
    mesh.castShadow = true;
    group.add(mesh);
  }
  if (hair !== null && thin.length > 0) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(thin, 3));
    group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: hair, transparent: true, opacity: 0.7 })));
  }
  return group;
}
