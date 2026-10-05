import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Billboard, Text } from '@react-three/drei';
import buildingData from '../../data/buildings.json';
import { CENTERLINE } from '../../data/corridor';
import { nearestOnPolyline } from '../../lib/geo';

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

const ALL = buildingData.buildings as RawBuilding[];

/**
 * Half-width of the roadway reserve, metres.
 *
 * Three travel lanes plus kerb and parking is about 15 m of carriageway, so
 * nothing should have a footprint within ~9 m of the centreline.
 */
const ROAD_CLEARANCE = 9.5;

/**
 * Drop any footprint that overlaps the roadway.
 *
 * OSM and the street centreline come from the same survey, so in principle
 * this should remove nothing. In practice it catches a handful of real cases —
 * pedestrian bridges tagged as buildings, canopies drawn across the street,
 * and footprints digitised before a road realignment — and those few were
 * enough to make it look like the towers had been dropped on the traffic.
 *
 * It is a safety net rather than a correction: if this starts removing a lot
 * of buildings, the street geometry is wrong and should be fixed instead.
 */
const RAW: RawBuilding[] = ALL.filter((b) => {
  for (const [x, z] of b.p) {
    if (nearestOnPolyline(CENTERLINE, { x, z }).dist < ROAD_CLEARANCE) return false;
  }
  return true;
});

export const BUILDINGS_REMOVED = ALL.length - RAW.length;

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
          <meshStandardMaterial color="#262a34" roughness={0.86} metalness={0.08} flatShading />
        </mesh>
      )}
      {bands.mid && (
        <mesh geometry={bands.mid}>
          <meshStandardMaterial color="#2d323f" roughness={0.7} metalness={0.24} flatShading />
        </mesh>
      )}
      {bands.high && (
        <mesh geometry={bands.high}>
          <meshStandardMaterial color="#363d4d" roughness={0.52} metalness={0.46} flatShading />
        </mesh>
      )}

      {showLabels &&
        labels.map((l) => (
          <Billboard key={`${l.name}-${l.x.toFixed(0)}`} position={[l.x, l.h + 18, l.z]}>
            <Text
              fontSize={9}
              color="#aab3c6"
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
