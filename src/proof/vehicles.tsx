/**
 * vehicles.tsx
 * ---------------------------------------------------------------------------
 * Real 3D vehicles for the animated proof, drawn hundreds at a time.
 *
 * The models are Kenney's Car Kit (CC0, public domain — see
 * public/models/LICENSE-kenney-car-kit.txt). Each model is split into a body
 * and its wheels, turned to face +x, and drawn as instanced meshes, so a
 * packed mile of 215 cars costs a handful of draw calls.
 *
 * Two touches make them read as real traffic rather than toys:
 *  - Bodies are stretched to true vehicle lengths, but wheels are placed
 *    separately at a uniform scale, so they stay round.
 *  - Paint is chosen per car from the colours people actually drive (lots of
 *    white, black and silver), by swapping the model's paint swatch in the
 *    shader. Taxis and police cars keep their livery.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ */
/* the fleet                                                           */
/* ------------------------------------------------------------------ */

export interface ModelSpec {
  file: string;
  /** the model's own paint colour (sRGB 0-255), or null to keep its livery */
  paint: [number, number, number] | null;
}

export const MODELS: ModelSpec[] = [
  { file: 'sedan', paint: [233, 98, 71] },
  { file: 'sedan-sports', paint: [238, 100, 69] },
  { file: 'hatchback-sports', paint: [71, 177, 126] },
  { file: 'suv', paint: [67, 172, 124] },
  { file: 'suv-luxury', paint: [255, 184, 76] },
  { file: 'van', paint: [95, 118, 203] },
  { file: 'delivery', paint: [90, 196, 135] },
  { file: 'truck', paint: [64, 170, 123] },
  { file: 'taxi', paint: null },
  { file: 'police', paint: null },
];

export const KIND = Object.fromEntries(MODELS.map((m, i) => [m.file, i])) as Record<string, number>;

const url = (file: string) => `${import.meta.env.BASE_URL}models/${file}.glb`;

/** Car colours by popularity on American roads, roughly. */
const PAINTS: Array<[string, number]> = [
  ['#e9e9e6', 0.24], // white
  ['#0c0d10', 0.2], // black
  ['#a3a8ae', 0.17], // silver
  ['#4b5058', 0.13], // grey
  ['#1d3a73', 0.08], // blue
  ['#8f1519', 0.08], // red
  ['#d9d2c2', 0.04], // pearl
  ['#2f4a3a', 0.03], // dark green
  ['#6b4a2c', 0.03], // bronze
];
const PAINT_COLORS = PAINTS.map(([hex, w]) => [new THREE.Color(hex), w] as const);

/** Deterministic paint for car `seed`; keeps the original livery ~8 % of the time. */
export function paintFor(seed: number, out: THREE.Color): boolean {
  const r = fract(Math.sin(seed * 91.7 + 13.3) * 43758.5453);
  if (r > 0.92) return false;
  let u = r / 0.92;
  for (const [c, w] of PAINT_COLORS) {
    if (u < w) {
      out.copy(c);
      return true;
    }
    u -= w;
  }
  out.copy(PAINT_COLORS[0][0]);
  return true;
}

const fract = (x: number) => x - Math.floor(x);

/* ------------------------------------------------------------------ */
/* model preparation                                                   */
/* ------------------------------------------------------------------ */

interface Prepared {
  body: THREE.BufferGeometry;
  wheelL: THREE.BufferGeometry;
  wheelR: THREE.BufferGeometry;
  /** hub centres in model space, front bumper at x = 0, ground at y = 0 */
  hubsL: THREE.Vector3[];
  hubsR: THREE.Vector3[];
  /** model length / width / height */
  size: THREE.Vector3;
  material: THREE.MeshPhysicalMaterial;
  /** per-instance paint (rgb + 'repaint?' flag), sized for MAX_PER_MODEL */
  paint: THREE.InstancedBufferAttribute;
}

/** The most cars of any one model drawn at once. */
export const MAX_PER_MODEL = 520;

const FACE_X = new THREE.Matrix4().makeRotationY(Math.PI / 2); // model +z → road +x

function prepare(scene: THREE.Object3D, spec: ModelSpec): Prepared {
  scene.updateMatrixWorld(true);
  const bodyParts: THREE.BufferGeometry[] = [];
  const hubsL: THREE.Vector3[] = [];
  const hubsR: THREE.Vector3[] = [];
  let wheelL: THREE.BufferGeometry | null = null;
  let wheelR: THREE.BufferGeometry | null = null;
  let map: THREE.Texture | null = null;

  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat.map) map = mat.map;
    if (mesh.name.startsWith('wheel')) {
      const hub = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld).applyMatrix4(FACE_X);
      // after facing +x, the model's left (+x) is the road's -z
      const left = hub.z < 0;
      // a centred wheel ("wheel-back" spare) is decoration — skip it
      if (Math.abs(hub.z) < 0.1) return;
      const g = mesh.geometry.clone().applyMatrix4(FACE_X);
      if (left) {
        hubsL.push(hub);
        wheelL ??= g;
      } else {
        hubsR.push(hub);
        wheelR ??= g;
      }
      return;
    }
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(FACE_X);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    bodyParts.push(g);
  });

  const body = mergeGeometries(bodyParts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
  // front bumper at x = 0, ground at y = 0, centred across
  body.computeBoundingBox();
  const bb = body.boundingBox!;
  const shift = new THREE.Vector3(-bb.max.x, -Math.min(bb.min.y, 0), -(bb.min.z + bb.max.z) / 2);
  body.translate(shift.x, shift.y, shift.z);
  for (const h of [...hubsL, ...hubsR]) h.add(shift);
  const size = new THREE.Vector3();
  body.computeBoundingBox();
  body.boundingBox!.getSize(size);

  const material = new THREE.MeshPhysicalMaterial({
    map,
    roughness: 0.42,
    metalness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.3,
  });
  if (spec.paint) addRepaint(material, spec.paint);

  // created with the geometry, so the two can never drift apart
  const paint = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PER_MODEL * 4), 4);
  paint.setUsage(THREE.DynamicDrawUsage);
  body.setAttribute('paint', paint);

  return { body, wheelL: wheelL!, wheelR: wheelR!, hubsL, hubsR, size, material, paint };
}

/**
 * Swap the model's paint swatch for a per-instance colour, keeping the
 * swatch's shading so panels still read as panels.
 */
function addRepaint(material: THREE.MeshPhysicalMaterial, key: [number, number, number]) {
  const k = new THREE.Color().setRGB(key[0] / 255, key[1] / 255, key[2] / 255, THREE.SRGBColorSpace);
  const keyMax = Math.max(k.r, k.g, k.b);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPaintKey = { value: new THREE.Vector3(k.r, k.g, k.b) };
    shader.uniforms.uKeyMax = { value: keyMax };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 paint;\nvarying vec4 vPaint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaint = paint;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec4 vPaint;\nuniform vec3 uPaintKey;\nuniform float uKeyMax;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec3 t = diffuseColor.rgb;
          float mx = max(max(t.r, t.g), t.b);
          float mn = min(min(t.r, t.g), t.b);
          float sat = (mx - mn) / max(mx, 1e-4);
          float hue = dot(normalize(t + 1e-5), normalize(uPaintKey));
          if (vPaint.w > 0.5 && sat > 0.35 && hue > 0.975) {
            diffuseColor.rgb = vPaint.rgb * clamp(mx / uKeyMax, 0.55, 1.25);
          }
        }`,
      );
  };
  material.customProgramCacheKey = () => `repaint-${key.join(',')}`;
}

export function useFleet(): Prepared[] {
  const gltfs = useGLTF(MODELS.map((m) => url(m.file)), false) as unknown as Array<{ scene: THREE.Object3D }>;
  return useMemo(() => gltfs.map((g, i) => prepare(g.scene, MODELS[i])), [gltfs]);
}

MODELS.forEach((m) => useGLTF.preload(url(m.file), false));

/* ------------------------------------------------------------------ */
/* drawing                                                             */
/* ------------------------------------------------------------------ */

export interface VehicleDraw {
  kind: number;
  /** front bumper position along the road */
  x: number;
  z: number;
  dir: 1 | -1;
  /** real length, width, height, metres */
  len: number;
  wid: number;
  hgt: number;
  paint: THREE.Color;
  repaint: boolean;
}

/** Real dimensions for a model when it is drawn as a given length. */
export function dimsFor(fleet: Prepared[], kind: number, len: number) {
  const s = fleet[kind].size;
  // pick a uniform scale from the width of a real car, stretch only the length
  const u = 1.9 / s.z;
  return { wid: s.z * u, hgt: s.y * u, len, u };
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _h = new THREE.Vector3();
const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const NOFLIP = new THREE.Quaternion();

/**
 * Instanced bodies and wheels for every model. `getCars` is called each frame
 * and returns the cars to draw; they are bucketed by model here.
 */
export function Fleet({ fleet, max, getCars }: { fleet: Prepared[]; max: number; getCars: () => { list: VehicleDraw[]; n: number } }) {
  const bodies = useRef<(THREE.InstancedMesh | null)[]>([]);
  const wheelsL = useRef<(THREE.InstancedMesh | null)[]>([]);
  const wheelsR = useRef<(THREE.InstancedMesh | null)[]>([]);

  const wheelMat = useMemo(
    () => new THREE.MeshStandardMaterial({ map: fleet[0].material.map, roughness: 0.7, metalness: 0.2 }),
    [fleet],
  );
  const paintAttrs = fleet.map((f) => f.paint);

  useFrame(() => {
    const { list, n } = getCars();
    const counts = new Array(fleet.length).fill(0);
    const wl = new Array(fleet.length).fill(0);
    const wr = new Array(fleet.length).fill(0);
    for (let i = 0; i < n; i++) {
      const c = list[i];
      const k = c.kind;
      const B = bodies.current[k];
      if (!B || counts[k] >= max) continue;
      const spec = fleet[k];
      const u = c.wid / spec.size.z;
      const sx = c.len / spec.size.x;
      const q = c.dir === 1 ? NOFLIP : FLIP;
      _p.set(c.x, 0, c.z);
      _s.set(sx, u, u);
      _m.compose(_p, q, _s);
      B.setMatrixAt(counts[k], _m);
      const pa = paintAttrs[k];
      pa.setXYZW(counts[k], c.paint.r, c.paint.g, c.paint.b, c.repaint ? 1 : 0);
      counts[k]++;

      // wheels: positioned on the stretched body, scaled uniformly so they stay round
      _s.set(u, u, u);
      for (const [hubs, mesh, ctr] of [
        [spec.hubsL, wheelsL.current[k], wl],
        [spec.hubsR, wheelsR.current[k], wr],
      ] as const) {
        if (!mesh) continue;
        for (const hub of hubs) {
          _h.set(hub.x * sx, hub.y * u, hub.z * u).applyQuaternion(q);
          _p.set(c.x + _h.x, _h.y, c.z + _h.z);
          _m.compose(_p, q, _s);
          if (ctr[k] < max * 3) mesh.setMatrixAt(ctr[k]++, _m);
        }
      }
    }
    fleet.forEach((_, k) => {
      const B = bodies.current[k];
      if (B) {
        B.count = counts[k];
        B.instanceMatrix.needsUpdate = true;
        paintAttrs[k].needsUpdate = true;
      }
      for (const [mesh, ctr] of [
        [wheelsL.current[k], wl],
        [wheelsR.current[k], wr],
      ] as const) {
        if (!mesh) continue;
        mesh.count = ctr[k];
        mesh.instanceMatrix.needsUpdate = true;
      }
    });
  });

  return (
    <group>
      {fleet.map((f, k) => (
        <group key={k}>
          <instancedMesh
            ref={(el) => {
              bodies.current[k] = el;
            }}
            args={[f.body, f.material, max]}
            frustumCulled={false}
          />
          <instancedMesh
            ref={(el) => {
              wheelsL.current[k] = el;
            }}
            args={[f.wheelL, wheelMat, max * 3]}
            frustumCulled={false}
          />
          <instancedMesh
            ref={(el) => {
              wheelsR.current[k] = el;
            }}
            args={[f.wheelR, wheelMat, max * 3]}
            frustumCulled={false}
          />
        </group>
      ))}
    </group>
  );
}
