import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Billboard, Text } from '@react-three/drei';
import buildingData from '../../data/buildings.json';

/**
 * DOWNTOWN LOS ANGELES, AS IT ACTUALLY STANDS
 *
 * Every block here is a real OpenStreetMap footprint, extruded to its real
 * recorded height, in the same metre grid as the road. Nothing is invented and
 * nothing is placed by eye: the Wilshire Grand is 335 m because it is 335 m,
 * and it sits where it sits because that is where its outline is.
 *
 * This matters to the project rather than just looking nice. South Figueroa is
 * a canyon — four to six lanes at the foot of the tallest towers in the
 * western United States — and all of that floor space empties onto this one
 * street twice a day. The skyline IS the demand.
 */

interface RawBuilding {
  /** height, metres */
  h: number;
  /** footprint in local metres, [[x, z], ...] */
  p: number[][];
  /** name, kept only for the tall ones */
  n?: string;
}

const RAW = buildingData.buildings as RawBuilding[];

/** Towers tall enough to be worth naming in the scene. */
const LABEL_MIN_HEIGHT = 205;

/**
 * Build one merged mesh per height band. Banding lets the taller towers take a
 * slightly different material without paying for one draw call per building,
 * and 400-odd separate meshes would be the single most expensive thing in the
 * scene.
 */
function buildBand(buildings: RawBuilding[]): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];

  for (const b of buildings) {
    if (b.p.length < 3) continue;
    const shape = new THREE.Shape();
    shape.moveTo(b.p[0][0], b.p[0][1]);
    for (let i = 1; i < b.p.length; i++) shape.lineTo(b.p[i][0], b.p[i][1]);
    shape.closePath();

    let geo: THREE.ExtrudeGeometry;
    try {
      geo = new THREE.ExtrudeGeometry(shape, {
        depth: b.h,
        bevelEnabled: false,
        curveSegments: 1,
      });
    } catch {
      continue; // a self-intersecting footprint that will not triangulate
    }

    // ExtrudeGeometry builds along +z; stand it up so the height is +y.
    geo.rotateX(-Math.PI / 2);
    parts.push(geo);
  }

  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!merged) return null;
  merged.computeVertexNormals();
  return merged;
}

export function Buildings({ showLabels = true }: { showLabels?: boolean }) {
  const bands = useMemo(() => {
    const low = RAW.filter((b) => b.h < 40);
    const mid = RAW.filter((b) => b.h >= 40 && b.h < 140);
    const high = RAW.filter((b) => b.h >= 140);
    return {
      low: buildBand(low),
      mid: buildBand(mid),
      high: buildBand(high),
    };
  }, []);

  const labels = useMemo(
    () =>
      RAW.filter((b) => b.n && b.h >= LABEL_MIN_HEIGHT).map((b) => {
        // label goes at the footprint's centroid, just above the roof
        const cx = b.p.reduce((s, q) => s + q[0], 0) / b.p.length;
        const cz = b.p.reduce((s, q) => s + q[1], 0) / b.p.length;
        return { name: b.n!, h: b.h, x: cx, z: cz };
      }),
    [],
  );

  useEffect(
    () => () => {
      bands.low?.dispose();
      bands.mid?.dispose();
      bands.high?.dispose();
    },
    [bands],
  );

  return (
    <group>
      {bands.low && (
        <mesh geometry={bands.low}>
          <meshStandardMaterial color="#1c1d22" roughness={0.9} metalness={0.05} flatShading />
        </mesh>
      )}
      {bands.mid && (
        <mesh geometry={bands.mid}>
          <meshStandardMaterial color="#212329" roughness={0.78} metalness={0.18} flatShading />
        </mesh>
      )}
      {bands.high && (
        <mesh geometry={bands.high}>
          <meshStandardMaterial color="#272a33" roughness={0.56} metalness={0.42} flatShading />
        </mesh>
      )}

      {showLabels &&
        labels.map((l) => (
          <Billboard key={`${l.name}-${l.x.toFixed(0)}`} position={[l.x, l.h + 18, l.z]}>
            <Text
              fontSize={9}
              color="#79839a"
              anchorX="center"
              anchorY="bottom"
              outlineWidth={0.45}
              outlineColor="#06060a"
              maxWidth={170}
            >
              {l.name}
            </Text>
          </Billboard>
        ))}
    </group>
  );
}

/** Names and heights of the towers on this corridor, for the UI. */
export const LANDMARKS = RAW.filter((b) => b.n)
  .slice(0, 10)
  .map((b) => ({ name: b.n!, height: b.h }));

export const BUILDING_COUNT = RAW.length;
