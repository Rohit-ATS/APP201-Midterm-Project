/**
 * geo.ts
 * ---------------------------------------------------------------------------
 * One projection, used by everything.
 *
 * The buildings come from OpenStreetMap in latitude/longitude. The traffic
 * comes from TomTom in latitude/longitude. The 3D scene works in metres. If
 * those three disagreed by even a few metres the cars would drive through the
 * lobby of the US Bank Tower, so all of them go through this file.
 *
 * Downtown Los Angeles is small enough (about 1.5 km of street) that a local
 * tangent-plane approximation is accurate to well under a metre. There is no
 * need for a real map projection here, and a real one would be harder to
 * check.
 */

import buildingData from '../data/buildings.json';

/** The origin of the local metre grid — Figueroa at about 7th Street. */
export const ORIGIN = buildingData.origin as { lat: number; lon: number };

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

export interface LatLon {
  lat: number;
  lon: number;
}

/** Local metres: +x east, −z north (matching the baked building footprints). */
export interface Local {
  x: number;
  z: number;
}

export function project(lat: number, lon: number): Local {
  return {
    x: (lon - ORIGIN.lon) * M_PER_DEG_LON,
    z: -(lat - ORIGIN.lat) * M_PER_DEG_LAT,
  };
}

export function unproject(x: number, z: number): LatLon {
  return {
    lon: ORIGIN.lon + x / M_PER_DEG_LON,
    lat: ORIGIN.lat - z / M_PER_DEG_LAT,
  };
}

/** Great-circle distance in metres. */
export function haversine(a: LatLon, b: LatLon): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ------------------------------------------------------------------ */
/* Polyline helpers                                                    */
/* ------------------------------------------------------------------ */

export interface PolyPoint extends Local {
  /** cumulative distance from the start of the line, metres */
  s: number;
}

/** Attach cumulative arc length to a list of local points. */
export function measure(points: Local[]): PolyPoint[] {
  let acc = 0;
  return points.map((p, i) => {
    if (i > 0) acc += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
    return { ...p, s: acc };
  });
}

/**
 * Nearest point on a polyline to a query point.
 *
 * Returns the arc position, the perpendicular distance, and the SIGNED
 * lateral offset. The sign matters: averaging raw GPS positions makes a
 * street wander, because overlapping traces sit in different lanes. Averaging
 * signed offsets from a straight spine instead keeps the street straight and
 * still lets the GPS correct it.
 */
export function nearestOnPolyline(
  line: PolyPoint[],
  q: Local,
): { s: number; dist: number; offset: number } {
  let best = { s: 0, dist: Infinity, offset: 0 };
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-9) continue;
    let t = ((q.x - a.x) * dx + (q.z - a.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx;
    const pz = a.z + t * dz;
    const dist = Math.hypot(q.x - px, q.z - pz);
    if (dist < best.dist) {
      const len = Math.sqrt(len2);
      // z-component of the cross product gives which side of the line we are
      const cross = (dx * (q.z - a.z) - dz * (q.x - a.x)) / len;
      best = { s: a.s + t * len, dist, offset: cross };
    }
  }
  return best;
}

/** Unit direction of the polyline at arc length s. */
export function tangentAt(line: PolyPoint[], s: number): Local {
  const total = line[line.length - 1].s;
  const t = Math.max(0, Math.min(total, s));
  let i = 0;
  while (i < line.length - 2 && line[i + 1].s < t) i++;
  const a = line[i];
  const b = line[i + 1];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

/** Unit left-hand normal of the polyline at arc length s. */
export function normalAt(line: PolyPoint[], s: number): Local {
  const t = tangentAt(line, s);
  return { x: -t.z, z: t.x };
}

/** Resample a polyline at a fixed spacing, so the road mesh is even. */
export function resample(line: PolyPoint[], spacing = 6): Local[] {
  if (line.length < 2) return line;
  const total = line[line.length - 1].s;
  const out: Local[] = [];
  for (let s = 0; s <= total; s += spacing) {
    out.push(pointAt(line, s));
  }
  const last = line[line.length - 1];
  out.push({ x: last.x, z: last.z });
  return out;
}

/** Position at arc length s along a measured polyline. */
export function pointAt(line: PolyPoint[], s: number): Local {
  if (s <= 0) return { x: line[0].x, z: line[0].z };
  const total = line[line.length - 1].s;
  if (s >= total) {
    const l = line[line.length - 1];
    return { x: l.x, z: l.z };
  }
  let i = 0;
  while (i < line.length - 2 && line[i + 1].s < s) i++;
  const a = line[i];
  const b = line[i + 1];
  const span = b.s - a.s || 1;
  const t = (s - a.s) / span;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/** Light smoothing pass — a moving average that keeps the endpoints fixed. */
export function smooth(points: Local[], passes = 2): Local[] {
  let cur = points;
  for (let p = 0; p < passes; p++) {
    const next: Local[] = [cur[0]];
    for (let i = 1; i < cur.length - 1; i++) {
      next.push({
        x: (cur[i - 1].x + cur[i].x * 2 + cur[i + 1].x) / 4,
        z: (cur[i - 1].z + cur[i].z * 2 + cur[i + 1].z) / 4,
      });
    }
    next.push(cur[cur.length - 1]);
    cur = next;
  }
  return cur;
}
