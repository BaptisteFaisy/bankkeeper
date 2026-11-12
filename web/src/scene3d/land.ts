// land.ts — what stands behind the town: a limestone range with snow on
// its heights, pines on its low slopes, and a few clouds far over it.

import * as THREE from 'three';
import { rng } from './math';
import { puffTexture } from './matter';

const ridge = (a: number): number => 1 - Math.abs(Math.sin(a));

/** Height of the range at a point; flat near the town, rising behind it. */
export function hillHeight(x: number, z: number): number {
  const back = THREE.MathUtils.smoothstep(-z, 150, 520);
  const h = 70 * ridge(x * 0.0062 + 1.3) + 46 * ridge(x * 0.013 + z * 0.006 + 0.4) + 22 * ridge(x * 0.031 - z * 0.021)
    + 9 * ridge(x * 0.083 + z * 0.057) + 4 * Math.sin(x * 0.21 + z * 0.17);
  return 12 + back * (10 + h * 0.62);
}

function hillColours(g: THREE.BufferGeometry): THREE.BufferAttribute {
  const p = g.attributes.position, n = g.attributes.normal;
  const col = new Float32Array(p.count * 3), c = new THREE.Color();
  const snow = new THREE.Color(0xf7fafc), rock = new THREE.Color(0x8fa3b8), turf = new THREE.Color(0xb9c9c4);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), slope = 1 - n.getY(i);
    const patch = Math.sin(p.getX(i) * 0.9) * Math.sin(p.getZ(i) * 0.7) * 6;
    c.copy(turf).lerp(rock, THREE.MathUtils.smoothstep(slope, 0.12, 0.42));
    c.lerp(snow, THREE.MathUtils.smoothstep(y + patch - slope * 40, 46, 70));
    c.toArray(col, i * 3);
  }
  return new THREE.BufferAttribute(col, 3);
}

export function hills(): THREE.Mesh {
  const g = new THREE.PlaneGeometry(2400, 760, 360, 114);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -530);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, hillHeight(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  g.setAttribute('color', hillColours(g));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  m.receiveShadow = true;
  return m;
}

export function trees(): THREE.InstancedMesh {
  const r = rng(4242), spots: number[][] = [];
  while (spots.length < 520) {
    const x = -520 + r() * 1040, z = -168 - r() * 250, y = hillHeight(x, z);
    if (y < 46 && r() > (y - 12) / 52) spots.push([x, y, z, 0.7 + r() * 0.9, r()]);
  }
  const geo = new THREE.ConeGeometry(2.4, 13, 7);
  geo.translate(0, 6.2, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x4f7477, roughness: 1, flatShading: true }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), tint = new THREE.Color();
  spots.forEach((s, i) => {
    const wide = s[3] * (0.8 + s[4] * 0.9);
    m.compose(new THREE.Vector3(s[0], s[1] - 0.5, s[2]), q, new THREE.Vector3(wide, s[3], wide));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, tint.setHSL(0.47 + s[4] * 0.06, 0.2, 0.3 + s[4] * 0.12));
  });
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** Points, not sprites: the ambient-occlusion pass skips points, so clouds never darken the sky. */
export function clouds(): THREE.Group {
  const tex = puffTexture(), group = new THREE.Group(), r = rng(99);
  const sizes = [260, 380, 520], pos: number[][] = [[], [], []];
  for (let c = 0; c < 15; c++) {
    const cx = -3200 + r() * 6400, cy = 560 + r() * 520, cz = -2600 - r() * 1800, w = 420 + r() * 520;
    for (let k = 0; k < 9; k++) {
      const u = k / 8 - 0.5;
      pos[(r() * 3) | 0].push(cx + u * w * 1.5 + (r() - 0.5) * 80, cy + (0.25 - u * u) * w * 0.55 * r(), cz + (r() - 0.5) * 60);
    }
  }
  pos.forEach((p, i) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    group.add(new THREE.Points(g, new THREE.PointsMaterial({ map: tex, size: sizes[i], transparent: true, depthWrite: false, fog: false, opacity: 0.85, color: 0xffffff })));
  });
  return group;
}
