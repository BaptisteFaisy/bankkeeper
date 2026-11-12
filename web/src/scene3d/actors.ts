// actors.ts — what moves: the hulls of the fleet and their wakes, the buoys
// that ring each ground, the ring under the boat you picked, and the crates
// that fly from a hull to the auction hall when a catch is landed.

import * as THREE from 'three';
import { GROUNDS, buildBoat, buildWake, wave, type Hull } from './fleet';
import { boatMaterials, gloss, type Mats } from './matter';
import { rigging, solid, type Classify } from './mesh';
import type { Crate, Frame } from './view';

export const BOAT_SCALE = 0.72;
const BUOYS = 16;
const MINE = 0x1b76e0, OTHER = 0xf4f6f9;
/** Brighter than white: the sea glitters, and foam must still read as foam after tone mapping. */
const FOAM = new THREE.Color(3, 3, 3);

const classifyBoat: Classify = (up, e, p) => {
  if (e > 0.3) return 'glass';
  if (p.y < 0.35) return 'keel';
  if (up > 0.97 && p.y < 1.6) return 'deck';
  return p.y < 1.95 ? 'hull' : 'house';
};

interface Boat { group: THREE.Group; wake: THREE.Mesh; mine: boolean }

/** The foam a moving hull leaves: a flat V on the water, plain white, faded as a whole. */
function wakeGeometry(): THREE.BufferGeometry {
  const raw = buildWake(), pos: number[] = [];
  for (let k = 0; k + 3 < raw.length; k += 4) pos.push(raw[k], raw[k + 1], raw[k + 2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

export class Actors {
  private boats = new Map<string, Boat>();
  private proto: { mine: THREE.Group; other: THREE.Group; rig: THREE.Group };
  private wakeGeo = wakeGeometry();
  private buoys: THREE.InstancedMesh;
  private ring: THREE.Mesh;
  private crates: THREE.Mesh[] = [];
  private lit = -2;
  private m = new THREE.Matrix4();

  constructor(private scene: THREE.Scene, harbour: Mats) {
    const geo = buildBoat();
    this.proto = {
      mine: solid(geo, classifyBoat, boatMaterials(MINE, harbour.glass), 0.3),
      other: solid(geo, classifyBoat, boatMaterials(OTHER, harbour.glass), 0.3),
      rig: rigging(geo, 0.19, 0.085, new THREE.MeshStandardMaterial({ color: 0xe9edf1, roughness: 0.45, metalness: 0.3 }), 0x4a6485),
    };
    this.buoys = new THREE.InstancedMesh(new THREE.SphereGeometry(0.75, 18, 12), gloss(0xffffff, 0.3), GROUNDS.length * BUOYS);
    this.buoys.castShadow = true;
    const ringGeo = new THREE.RingGeometry(9.6, 10.6, 64);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: FOAM, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.visible = false;
    const wood = new THREE.MeshStandardMaterial({ color: 0xc8a57a, roughness: 0.8 });
    for (let k = 0; k < 6; k++) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.2), wood);
      crate.castShadow = true;
      crate.visible = false;
      this.crates.push(crate);
    }
    scene.add(this.buoys, this.ring, ...this.crates);
    this.paintBuoys(-1);
  }

  private launch(h: Hull): Boat {
    const group = new THREE.Group();
    group.add((h.mine ? this.proto.mine : this.proto.other).clone(), this.proto.rig.clone());
    group.scale.setScalar(BOAT_SCALE);
    const foam = new THREE.MeshBasicMaterial({ color: FOAM, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
    const wake = new THREE.Mesh(this.wakeGeo, foam);
    wake.scale.setScalar(BOAT_SCALE);
    this.scene.add(group, wake);
    return { group, wake, mine: h.mine };
  }

  private scrap(id: string, b: Boat): void {
    this.scene.remove(b.group, b.wake);
    this.boats.delete(id);
  }

  private sail(f: Frame): void {
    const live = new Set(f.hulls.map((h) => h.id));
    for (const [id, b] of this.boats) if (!live.has(id)) this.scrap(id, b);
    let picked: Hull | null = null;
    for (const h of f.hulls) {
      let b = this.boats.get(h.id);
      if (b !== undefined && b.mine !== h.mine) { this.scrap(h.id, b); b = undefined; }
      if (b === undefined) { b = this.launch(h); this.boats.set(h.id, b); }
      b.group.position.set(h.x, wave(h.x, h.z, f.t) * 0.8 - 0.15, h.z);
      b.group.rotation.set(Math.sin(f.t * 0.7 + h.seat * 2) * 0.035, -h.h, Math.sin(f.t * 0.9 + h.seat) * 0.02);
      b.wake.visible = h.v > 1;
      b.wake.position.set(h.x, 0, h.z);
      b.wake.rotation.y = -h.h;
      (b.wake.material as THREE.MeshBasicMaterial).opacity = Math.min(1, h.v / 12) * 0.3;
      if (h.selected) picked = h;
    }
    this.ring.visible = picked !== null;
    if (picked !== null) {
      this.ring.position.set(picked.x, 0.22, picked.z);
      this.ring.scale.setScalar(1 + Math.sin(f.t * 3) * 0.04);
    }
  }

  /** The hovered ground answers: its buoys turn to the player's blue. */
  private paintBuoys(hover: number): void {
    if (hover === this.lit) return;
    this.lit = hover;
    const white = new THREE.Color(0xffffff), hot = new THREE.Color(MINE);
    for (let i = 0; i < GROUNDS.length * BUOYS; i++) this.buoys.setColorAt(i, Math.floor(i / BUOYS) === hover ? hot : white);
    if (this.buoys.instanceColor !== null) this.buoys.instanceColor.needsUpdate = true;
  }

  private bob(f: Frame): void {
    GROUNDS.forEach((g, gi) => {
      for (let k = 0; k < BUOYS; k++) {
        const a = (k / BUOYS) * Math.PI * 2, x = g.x + Math.cos(a) * g.r, z = g.z + Math.sin(a) * g.r;
        const s = gi === f.hover ? 1.35 : 1;
        this.m.makeScale(s, s, s).setPosition(x, 0.12 + wave(x, z, f.t) * 0.6, z);
        this.buoys.setMatrixAt(gi * BUOYS + k, this.m);
      }
    });
    this.buoys.instanceMatrix.needsUpdate = true;
  }

  private fly(crate: THREE.Mesh, c: Crate | undefined, t: number): void {
    crate.visible = c !== undefined && t >= c.t0;
    if (c === undefined) return;
    const p = Math.max(0, Math.min(1, (t - c.t0) / c.dur)), q = p * p * (3 - 2 * p);
    crate.position.set(c.a[0] + (c.b[0] - c.a[0]) * q, c.a[1] + (c.b[1] - c.a[1]) * q + Math.sin(p * Math.PI) * 9, c.a[2] + (c.b[2] - c.a[2]) * q);
    crate.rotation.y = p * 3;
  }

  update(f: Frame): void {
    this.sail(f);
    this.paintBuoys(f.hover);
    this.bob(f);
    this.crates.forEach((crate, k) => this.fly(crate, f.crates[k], f.t));
  }
}
