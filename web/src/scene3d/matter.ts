// matter.ts — what the harbour is made of. Every texture is painted here on
// a small canvas (no image file): lime plaster, blue glazed tiles, paving,
// quay blocks with their tide line. Glass and lacquer reflect the sky.

import * as THREE from 'three';
import { rng } from './math';

type Paint = (g: CanvasRenderingContext2D, s: number, r: () => number) => void;

function canvasTexture(size: number, paint: Paint): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g === null) throw new Error('scene3d: no 2D canvas for textures');
  paint(g, size, rng(size * 7 + 13));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(g: CanvasRenderingContext2D, s: number, r: () => number, n: number, a: number): void {
  for (let k = 0; k < n; k++) {
    const v = (150 + r() * 105) | 0;
    g.fillStyle = `rgba(${v},${v},${v + 6},${r() * a})`;
    g.fillRect(r() * s, r() * s, 1 + r() * 2.5, 1 + r() * 2.5);
  }
}

const plaster: Paint = (g, s, r) => {
  g.fillStyle = '#f1f4f7';
  g.fillRect(0, 0, s, s);
  speckle(g, s, r, 9000, 0.22);
  // Rain streaks under the eaves.
  for (let k = 0; k < 26; k++) {
    g.fillStyle = `rgba(120,140,165,${r() * 0.07})`;
    g.fillRect(r() * s, 0, 2 + r() * 10, s);
  }
};

const tiles: Paint = (g, s, r) => {
  g.fillStyle = '#4b97dc';
  g.fillRect(0, 0, s, s);
  const h = s / 8, w = s / 6;
  for (let row = 0; row < 8; row++) {
    for (let col = -1; col < 7; col++) {
      const x = col * w + ((row % 2) * w) / 2;
      g.fillStyle = `hsl(${208 + r() * 8},62%,${46 + r() * 16}%)`;
      g.fillRect(x + 1, row * h + 1, w - 2, h - 2);
      g.fillStyle = 'rgba(10,30,60,.38)';
      g.fillRect(x, row * h + h - 3, w, 3);
      g.fillStyle = 'rgba(255,255,255,.16)';
      g.fillRect(x + 1, row * h + 1, w - 2, 2);
    }
  }
};

const paving: Paint = (g, s, r) => {
  g.fillStyle = '#d3dbe3';
  g.fillRect(0, 0, s, s);
  speckle(g, s, r, 7000, 0.25);
  g.strokeStyle = 'rgba(70,90,115,.35)';
  g.lineWidth = 1.5;
  const seam = (x0: number, y0: number, x1: number, y1: number): void => {
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  };
  for (let k = 0; k <= 8; k++) seam(0, (k * s) / 8, s, (k * s) / 8);
  for (let row = 0; row < 8; row++) {
    for (let k = 0; k < 5; k++) {
      const x = ((k + (row % 2) * 0.5 + r() * 0.2) * s) / 5;
      seam(x, (row * s) / 8, x, ((row + 1) * s) / 8);
    }
  }
};

const blocks: Paint = (g, s, r) => {
  g.fillStyle = '#a9b8c8';
  g.fillRect(0, 0, s, s);
  for (let row = 0; row < 4; row++) {
    for (let col = -1; col < 4; col++) {
      const x = ((col + (row % 2) * 0.5) * s) / 3, v = (150 + r() * 40) | 0;
      g.fillStyle = `rgb(${v},${v + 10},${v + 24})`;
      g.fillRect(x + 2, (row * s) / 4 + 2, s / 3 - 4, s / 4 - 4);
    }
  }
  speckle(g, s, r, 8000, 0.3);
  // The tide line.
  g.fillStyle = 'rgba(40,70,60,.22)';
  g.fillRect(0, s * 0.82, s, s * 0.18);
};

export type Mats = Record<string, THREE.Material>;

function rough(map: THREE.Texture, roughness: number, bumpScale: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale, roughness, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide });
}

/** A lacquered surface: paint under a clear coat. */
export function gloss(color: number, roughness: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness, clearcoat: 0.7, clearcoatRoughness: 0.2, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide });
}

export function harbourMaterials(): Mats {
  const stone = canvasTexture(256, paving);
  return {
    wall: rough(canvasTexture(256, plaster), 0.92, 0.6),
    roof: rough(canvasTexture(256, tiles), 0.7, 2.2),
    stone: rough(stone, 0.95, 1),
    quay: rough(canvasTexture(256, blocks), 0.9, 2),
    rock: rough(stone, 1, 1),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0e2a4a, roughness: 0.06, metalness: 0.1, envMapIntensity: 2.2, side: THREE.DoubleSide }),
  };
}

/** The paint of a trawler; `hull` is the colour that says whose it is. */
export function boatMaterials(hull: number, glass: THREE.Material): Mats {
  return {
    glass,
    keel: gloss(0x16324f, 0.5),
    deck: new THREE.MeshStandardMaterial({ color: 0xc8a57a, roughness: 0.85, side: THREE.DoubleSide }),
    hull: gloss(hull, 0.32),
    house: gloss(0xf6f8fa, 0.4),
  };
}

/** A soft white puff, for the clouds. */
export function puffTexture(): THREE.CanvasTexture {
  return canvasTexture(128, (g, s) => {
    g.clearRect(0, 0, s, s);
    const fade = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    fade.addColorStop(0, 'rgba(255,255,255,1)');
    fade.addColorStop(0.55, 'rgba(255,255,255,.55)');
    fade.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = fade;
    g.fillRect(0, 0, s, s);
  });
}
