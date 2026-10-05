import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import roadData from '../../data/roads.json';

/**
 * THE CITY AROUND THE STREET
 *
 * Figueroa on its own, floating on an empty plane, reads as a diagram. What
 * makes downtown look like downtown is everything around it: the grid of cross
 * streets, the 110 ramps curling in from the west, the alleys behind the
 * towers, the sidewalks, Pershing Square.
 *
 * All of this is real OpenStreetMap geometry in the same metre grid as the
 * roadway and the buildings — 1,955 ways in all — so nothing is placed by eye
 * and the cross streets meet Figueroa exactly where they meet it in Los
 * Angeles.
 *
 * Each tier is merged into a single mesh and laid down at its own height, a
 * few millimetres apart, so that sidewalks sit on top of streets and streets
 * sit on top of the ground without any z-fighting.
 */

interface RawRoad {
  t: 'highway' | 'major' | 'minor' | 'path';
  w: number;
  p: number[][];
}

interface RawArea {
  k: 'park' | 'grass';
  p: number[][];
}

const ROADS = roadData.roads as RawRoad[];
const AREAS = roadData.areas as RawArea[];

/** Turn a centreline and a width into a flat ribbon lying in the XZ plane. */
function ribbon(points: number[][], width: number): THREE.BufferGeometry | null {
  if (points.length < 2) return null;

  const half = width / 2;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) {
      dx = 1;
      dz = 0;
    } else {
      dx /= len;
      dz /= len;
    }
    // left-hand normal
    const nx = -dz;
    const nz = dx;
    positions.push(
      points[i][0] + nx * half, 0, points[i][1] + nz * half,
      points[i][0] - nx * half, 0, points[i][1] - nz * half,
    );
    if (i < points.length - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function mergeTier(tier: RawRoad['t']): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const r of ROADS) {
    if (r.t !== tier) continue;
    const g = ribbon(r.p, r.w);
    if (g) parts.push(g);
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged ?? null;
}

function mergeAreas(kind: RawArea['k']): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const a of AREAS) {
    if (a.k !== kind || a.p.length < 3) continue;
    const shape = new THREE.Shape();
    shape.moveTo(a.p[0][0], a.p[0][1]);
    for (let i = 1; i < a.p.length; i++) shape.lineTo(a.p[i][0], a.p[i][1]);
    shape.closePath();
    try {
      const g = new THREE.ShapeGeometry(shape);
      g.rotateX(-Math.PI / 2);
      parts.push(g);
    } catch {
      /* a self-intersecting outline that will not triangulate */
    }
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged ?? null;
}

export function CityGround() {
  const layers = useMemo(
    () => ({
      highway: mergeTier('highway'),
      major: mergeTier('major'),
      minor: mergeTier('minor'),
      path: mergeTier('path'),
      park: mergeAreas('park'),
      grass: mergeAreas('grass'),
    }),
    [],
  );

  useEffect(
    () => () => {
      Object.values(layers).forEach((g) => g?.dispose());
    },
    [layers],
  );

  return (
    <group>
      {/* the plane everything sits on */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, 0]} receiveShadow={false}>
        <planeGeometry args={[7000, 7000]} />
        <meshStandardMaterial color="#101218" roughness={1} />
      </mesh>

      {layers.park && (
        <mesh geometry={layers.park} position={[0, -0.26, 0]}>
          <meshStandardMaterial color="#1e2a22" roughness={1} />
        </mesh>
      )}
      {layers.grass && (
        <mesh geometry={layers.grass} position={[0, -0.25, 0]}>
          <meshStandardMaterial color="#1f2b23" roughness={1} />
        </mesh>
      )}

      {layers.highway && (
        <mesh geometry={layers.highway} position={[0, -0.2, 0]}>
          <meshStandardMaterial color="#4c505c" roughness={0.86} metalness={0.06} />
        </mesh>
      )}
      {layers.major && (
        <mesh geometry={layers.major} position={[0, -0.16, 0]}>
          <meshStandardMaterial color="#474b57" roughness={0.86} metalness={0.06} />
        </mesh>
      )}
      {layers.minor && (
        <mesh geometry={layers.minor} position={[0, -0.12, 0]}>
          <meshStandardMaterial color="#3e424d" roughness={0.9} />
        </mesh>
      )}
      {layers.path && (
        <mesh geometry={layers.path} position={[0, -0.06, 0]}>
          <meshStandardMaterial color="#565a66" roughness={0.95} />
        </mesh>
      )}
    </group>
  );
}

export const ROAD_WAY_COUNT = ROADS.length;
