// view.ts — the GPU side of the harbour, drawn with three.js: a physical
// sky, a reflective sea, sun shadows, contact shadows (ambient occlusion)
// and real materials. It draws what the `Frame` says and decides nothing.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { Mat4, Vec3 } from './math';
import { FAR, FOV, NEAR } from './camera';
import { QZ, buildHarbour, type Harbour } from './harbour';
import type { Hull } from './fleet';
import { harbourMaterials, type Mats } from './matter';
import { clouds, hills, trees } from './land';
import { rigging, solid, type Classify } from './mesh';
import { buildWorld } from './world';
import { Actors } from './actors';

export interface Crate { a: Vec3; b: Vec3; t0: number; dur: number }

export interface Frame {
  t: number;
  vp: Mat4;
  eye: Vec3;
  cam: { F: Vec3; R: Vec3; U: Vec3; tanX: number; tanY: number; shift: number };
  hulls: Hull[];
  crates: Crate[];
  stock: [number, number, number];
  rest: [number, number, number];
  focus: [number, number, number, number];
  /** Highlighted ground: index, or -1. */
  hover: number;
}

export interface View {
  harbour: Harbour;
  /** Size of the drawing buffer, in device pixels. */
  resize(w: number, h: number): void;
  paint(f: Frame): void;
}

/** A frame slower than this counts against the contact shadows. */
const SLOW_MS = 45;
const SLOW_FRAMES = 40;

const classifyHarbour: Classify = (up, e, p) => {
  // The old prism hills: the range of `land.ts` replaces them.
  if (p.z < -160.5) return null;
  if (e > 0.3) return 'glass';
  if (Math.abs(p.x) > 100) return 'rock';
  if (up > 0.2 && up < 0.93 && p.y > 5) return 'roof';
  if (p.y < 3.05 && p.z > QZ - 9) return 'quay';
  return up > 0.97 ? 'stone' : 'wall';
};

function town(harbour: Harbour, mats: Mats): THREE.Group {
  const group = solid(harbour.geo, classifyHarbour, mats, 0.11);
  const steel = new THREE.MeshStandardMaterial({ color: 0x5d7389, roughness: 0.5, metalness: 0.4 });
  group.add(rigging(harbour.geo, 0.4, 0.13, steel, null));
  return group;
}

interface Post { composer: EffectComposer; gtao: GTAOPass }

function post(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Post {
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { samples: 4, type: THREE.HalfFloatType }));
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 4, 4);
  gtao.updateGtaoMaterial({ radius: 3.2, distanceExponent: 1.4, thickness: 1.2, scale: 1.25, samples: 8 });
  gtao.blendIntensity = 0.9;
  composer.addPass(gtao);
  composer.addPass(new OutputPass());
  return { composer, gtao };
}

function aim(camera: THREE.PerspectiveCamera, f: Frame): void {
  camera.position.set(f.eye[0], f.eye[1], f.eye[2]);
  camera.lookAt(f.eye[0] + f.cam.F[0], f.eye[1] + f.cam.F[1], f.eye[2] + f.cam.F[2]);
  camera.updateProjectionMatrix();
  // The same lens shift as `camera.ts`: the picture leaves room for the deck.
  camera.projectionMatrix.elements[8] = f.cam.shift;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

function build(canvas: HTMLCanvasElement): View {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;
  const world = buildWorld(renderer), harbour = buildHarbour(), mats = harbourMaterials();
  world.scene.add(town(harbour, mats), hills(), trees(), clouds());
  const actors = new Actors(world.scene, mats);
  const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(FOV), 1.6, NEAR, FAR);
  const fx = post(renderer, world.scene, camera);
  let last = 0, slow = 0;
  return {
    harbour,
    resize(w: number, h: number): void {
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      fx.composer.setSize(w, h);
      camera.aspect = w / h;
    },
    paint(f: Frame): void {
      const now = performance.now(), gap = now - last;
      last = now;
      // A machine that cannot keep up gives up the contact shadows, not the game.
      if (fx.gtao.enabled && gap > SLOW_MS && gap < 400 && ++slow > SLOW_FRAMES) fx.gtao.enabled = false;
      aim(camera, f);
      actors.update(f);
      world.water.material.uniforms.time.value = f.t * 0.35;
      fx.composer.render();
    },
  };
}

const views = new WeakMap<HTMLCanvasElement, View>();

/** One renderer per canvas, kept across remounts. Throws when the browser has no WebGL. */
export function createView(canvas: HTMLCanvasElement): View {
  let view = views.get(canvas);
  if (view === undefined) {
    view = build(canvas);
    views.set(canvas, view);
  }
  return view;
}
