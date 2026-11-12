// world.ts — the light of the picture: a physical sky, a sun low enough to
// draw long shadows, the sky reflected on every surface, haze over the
// distance, and a sea that mirrors all of it.

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';

export interface World { scene: THREE.Scene; water: Water }

const SUN = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 26), THREE.MathUtils.degToRad(222));

function sky(): Sky {
  const s = new Sky();
  s.scale.setScalar(9000);
  const u = s.material.uniforms;
  u.turbidity.value = 2.4;
  u.rayleigh.value = 1.25;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.82;
  u.sunPosition.value.copy(SUN);
  return s;
}

function sunLight(): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight(0xfff1dc, 3.6);
  light.position.copy(SUN).multiplyScalar(520).add(new THREE.Vector3(0, 0, -50));
  light.target.position.set(0, 0, -50);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.5;
  Object.assign(light.shadow.camera, { left: -180, right: 180, top: 180, bottom: -180, near: 50, far: 1400 });
  return light;
}

/** A tiling normal map of crossed swells, computed once. */
function swell(size: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4), n = new THREE.Vector3();
  const waves = [[1, 2, 1], [3, -1, 0.6], [-2, 5, 0.45], [7, 3, 0.25], [-5, -9, 0.2], [13, 4, 0.16], [-8, 15, 0.14], [21, -11, 0.1], [-27, 19, 0.08], [34, 9, 0.06], [-16, -37, 0.05]];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0, dy = 0;
      const u = (x / size) * Math.PI * 2, v = (y / size) * Math.PI * 2;
      for (const w of waves) {
        const c = Math.cos(w[0] * u + w[1] * v + w[0] * 1.7) * w[2];
        dx += c * w[0];
        dy += c * w[1];
      }
      n.set(-dx * 0.05, -dy * 0.05, 1).normalize();
      data.set([(n.x * 0.5 + 0.5) * 255, (n.y * 0.5 + 0.5) * 255, (n.z * 0.5 + 0.5) * 255, 255], (y * size + x) * 4);
    }
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

function sea(): Water {
  const water = new Water(new THREE.PlaneGeometry(9000, 9000), {
    textureWidth: 512, textureHeight: 512, waterNormals: swell(256), sunDirection: SUN.clone(),
    sunColor: 0xffffff, waterColor: 0x1f7fc4, distortionScale: 5, fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.material.uniforms.size.value = 0.9;
  return water;
}

export function buildWorld(renderer: THREE.WebGLRenderer): World {
  const scene = new THREE.Scene(), dome = sky();
  const lit = new THREE.Scene();
  lit.add(dome);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(lit).texture;
  scene.environmentIntensity = 0.7;
  scene.fog = new THREE.Fog(0xcfe4f6, 420, 3000);
  const light = sunLight(), water = sea();
  scene.add(dome, light, light.target, water);
  return { scene, water };
}
