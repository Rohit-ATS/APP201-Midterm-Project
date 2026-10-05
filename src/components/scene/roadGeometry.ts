import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { VehicleClass } from '../../data/vehicleMix';

/* ===================================================================== */
/* THE ROAD                                                              */
/* ===================================================================== */
/*
 * The simulation runs on a loop of a fixed length, so the road is modelled as
 * a CLOSED curve of exactly that length. Nothing teleports: a car that leaves
 * the bottom of the pass genuinely comes back around. The shape is a long,
 * lazy kidney, which reads as a stretch of freeway from any normal camera
 * angle while still closing on itself.
 */

/** Build a closed curve whose arc length is approximately `length` metres. */
export function buildRoadCurve(length: number): THREE.CatmullRomCurve3 {
  // A kidney/peanut outline in plan view, with gentle elevation change to
  // suggest the climb over the pass.
  const shape: Array<[number, number, number]> = [
    [0, 0, -1],
    [0.62, 0.1, -0.78],
    [0.95, 0.26, -0.22],
    [0.88, 0.34, 0.36],
    [0.46, 0.3, 0.78],
    [-0.1, 0.16, 0.95],
    [-0.62, 0.05, 0.72],
    [-0.95, 0.0, 0.16],
    [-0.74, 0.02, -0.48],
    [-0.3, 0.0, -0.9],
  ];

  const unit = new THREE.CatmullRomCurve3(
    shape.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    true,
    'catmullrom',
    0.5,
  );

  const unitLength = unit.getLength();
  const scale = length / unitLength;

  return new THREE.CatmullRomCurve3(
    shape.map(([x, y, z]) => new THREE.Vector3(x * scale, y * scale * 0.09, z * scale)),
    true,
    'catmullrom',
    0.5,
  );
}

export interface RoadFrame {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
}

/**
 * Position and orientation at a distance `s` along the road, offset sideways
 * by `lateral` metres. This is what places every car.
 */
export function frameAt(
  curve: THREE.CatmullRomCurve3,
  s: number,
  totalLength: number,
  lateral: number,
  out: RoadFrame,
): RoadFrame {
  const t = ((s % totalLength) + totalLength) / totalLength % 1;
  curve.getPointAt(t, out.position);
  curve.getTangentAt(t, out.tangent);
  // sideways direction: tangent crossed with world up
  out.normal.set(0, 1, 0).cross(out.tangent).normalize();
  out.position.addScaledVector(out.normal, lateral);
  return out;
}

export const makeFrame = (): RoadFrame => ({
  position: new THREE.Vector3(),
  tangent: new THREE.Vector3(),
  normal: new THREE.Vector3(),
});

/** A flat ribbon following the curve — the asphalt. */
export function buildRoadSurface(
  curve: THREE.CatmullRomCurve3,
  width: number,
  segments = 600,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const p = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const nor = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t % 1, p);
    curve.getTangentAt(t % 1, tan);
    nor.copy(up).cross(tan).normalize();

    positions.push(
      p.x + nor.x * width * 0.5,
      p.y,
      p.z + nor.z * width * 0.5,
      p.x - nor.x * width * 0.5,
      p.y,
      p.z - nor.z * width * 0.5,
    );
    uvs.push(0, t * segments * 0.5, 1, t * segments * 0.5);

    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Dashed lane lines, as one merged geometry of small quads. */
export function buildLaneMarkings(
  curve: THREE.CatmullRomCurve3,
  totalLength: number,
  lanes: number,
  laneWidth: number,
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const frame = makeFrame();
  const dash = 3;
  const gap = 9;
  const stride = dash + gap;
  const quad = new THREE.PlaneGeometry(0.14, dash);
  quad.rotateX(-Math.PI / 2);

  for (let lane = 1; lane < lanes; lane++) {
    const lateral = (lane - lanes / 2) * laneWidth;
    for (let s = 0; s < totalLength; s += stride) {
      frameAt(curve, s, totalLength, lateral, frame);
      const g = quad.clone();
      const m = new THREE.Matrix4();
      const angle = Math.atan2(frame.tangent.x, frame.tangent.z);
      m.makeRotationY(angle);
      m.setPosition(frame.position.x, frame.position.y + 0.02, frame.position.z);
      g.applyMatrix4(m);
      parts.push(g);
    }
  }

  quad.dispose();
  return parts.length ? mergeGeometries(parts, false)! : new THREE.BufferGeometry();
}

/** Solid edge lines on both shoulders. */
export function buildEdgeLines(
  curve: THREE.CatmullRomCurve3,
  totalLength: number,
  halfWidth: number,
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const frame = makeFrame();
  const step = 2.5;
  const quad = new THREE.PlaneGeometry(0.18, step * 1.02);
  quad.rotateX(-Math.PI / 2);

  for (const side of [-1, 1]) {
    for (let s = 0; s < totalLength; s += step) {
      frameAt(curve, s, totalLength, side * halfWidth, frame);
      const g = quad.clone();
      const m = new THREE.Matrix4();
      m.makeRotationY(Math.atan2(frame.tangent.x, frame.tangent.z));
      m.setPosition(frame.position.x, frame.position.y + 0.02, frame.position.z);
      g.applyMatrix4(m);
      parts.push(g);
    }
  }

  quad.dispose();
  return parts.length ? mergeGeometries(parts, false)! : new THREE.BufferGeometry();
}

/* ===================================================================== */
/* THE VEHICLES                                                          */
/* ===================================================================== */
/*
 * The traffic API reports how fast vehicles are moving, never what they are.
 * So every vehicle here is drawn from the real fleet composition in
 * data/vehicleMix.ts — the SHAPES are honest even though no individual car is.
 *
 * Each silhouette is built from boxes and merged into a single geometry so the
 * whole class can be drawn with one instanced draw call. All models are built
 * at their true dimensions in metres, which matters: the length of these boxes
 * is the L in the spacing equation.
 */

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/** Four wheels, as flattened cylinders. */
function wheels(
  length: number,
  width: number,
  radius: number,
  axleInset = 0.22,
): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const g0 = new THREE.CylinderGeometry(radius, radius, 0.22, 10);
  g0.rotateZ(Math.PI / 2);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const g = g0.clone();
      g.translate((width / 2 - 0.08) * sx, radius, (length / 2) * sz * (1 - axleInset));
      out.push(g);
    }
  }
  g0.dispose();
  return out;
}

/**
 * Build the merged geometry for one vehicle class. The local axes are:
 * +Z forward (direction of travel), +Y up, +X right.
 */
export function buildVehicleGeometry(cls: VehicleClass): THREE.BufferGeometry {
  const { length: L, width: W, height: H, body } = cls;
  const parts: THREE.BufferGeometry[] = [];
  const wheelR = Math.min(0.36, H * 0.22);
  const sill = wheelR * 0.9;

  switch (body) {
    case 'sedan': {
      parts.push(box(W, H * 0.42, L, 0, sill + H * 0.21, 0));
      parts.push(box(W * 0.86, H * 0.34, L * 0.5, 0, sill + H * 0.42 + H * 0.17, -L * 0.04));
      parts.push(...wheels(L, W, wheelR));
      break;
    }
    case 'suv': {
      parts.push(box(W, H * 0.46, L, 0, sill + H * 0.23, 0));
      parts.push(box(W * 0.9, H * 0.38, L * 0.62, 0, sill + H * 0.46 + H * 0.19, -L * 0.03));
      parts.push(...wheels(L, W, wheelR));
      break;
    }
    case 'pickup': {
      parts.push(box(W, H * 0.4, L, 0, sill + H * 0.2, 0));
      // cab forward, bed walls behind
      parts.push(box(W * 0.9, H * 0.4, L * 0.38, 0, sill + H * 0.4 + H * 0.2, L * 0.18));
      parts.push(box(W * 0.96, H * 0.18, L * 0.44, 0, sill + H * 0.4 + H * 0.09, -L * 0.26));
      parts.push(...wheels(L, W, wheelR));
      break;
    }
    case 'van': {
      parts.push(box(W, H * 0.62, L, 0, sill + H * 0.31, 0));
      parts.push(box(W * 0.92, H * 0.26, L * 0.72, 0, sill + H * 0.62 + H * 0.13, -L * 0.06));
      parts.push(...wheels(L, W, wheelR));
      break;
    }
    case 'box': {
      parts.push(box(W * 0.94, H * 0.42, L * 0.3, 0, sill + H * 0.21, L * 0.34));
      parts.push(box(W, H * 0.72, L * 0.68, 0, sill + H * 0.36, -L * 0.15));
      parts.push(...wheels(L, W, wheelR * 1.15, 0.26));
      break;
    }
    case 'semi': {
      // tractor
      parts.push(box(W * 0.96, H * 0.5, L * 0.18, 0, sill + H * 0.25, L * 0.4));
      parts.push(box(W * 0.9, H * 0.3, L * 0.12, 0, sill + H * 0.5 + H * 0.15, L * 0.42));
      // trailer
      parts.push(box(W, H * 0.62, L * 0.7, 0, sill + H * 0.42, -L * 0.14));
      parts.push(...wheels(L, W, wheelR * 1.2, 0.12));
      break;
    }
    case 'bus': {
      parts.push(box(W, H * 0.78, L, 0, sill + H * 0.39, 0));
      parts.push(...wheels(L, W, wheelR * 1.1, 0.18));
      break;
    }
    case 'moto': {
      parts.push(box(W, H * 0.28, L * 0.8, 0, sill + H * 0.22, 0));
      parts.push(box(W * 0.5, H * 0.34, L * 0.22, 0, sill + H * 0.45, -L * 0.05));
      const g0 = new THREE.CylinderGeometry(wheelR, wheelR, 0.12, 10);
      g0.rotateZ(Math.PI / 2);
      for (const sz of [-1, 1]) {
        const g = g0.clone();
        g.translate(0, wheelR, (L / 2) * sz * 0.72);
        parts.push(g);
      }
      g0.dispose();
      break;
    }
  }

  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  merged.computeVertexNormals();
  return merged;
}

/** A small plate at the rear, used for the brake lights. */
export function buildBrakeLightGeometry(cls: VehicleClass): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(cls.width * 0.82, 0.14, 0.06);
  g.translate(0, cls.height * 0.45, -cls.length / 2 - 0.03);
  return g;
}

/** Two headlamps at the front. Constant colour — these are never data. */
export function buildHeadlightGeometry(cls: VehicleClass): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const lamp = new THREE.BoxGeometry(cls.width * 0.2, 0.13, 0.07);
  for (const sx of [-1, 1]) {
    const g = lamp.clone();
    g.translate(sx * cls.width * 0.31, cls.height * 0.42, cls.length / 2 + 0.035);
    parts.push(g);
  }
  lamp.dispose();
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}
