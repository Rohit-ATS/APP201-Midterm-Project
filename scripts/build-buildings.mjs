/**
 * build-buildings.mjs
 * ---------------------------------------------------------------------------
 * Turns raw OpenStreetMap building data for downtown Los Angeles into the
 * compact file the 3D scene loads.
 *
 * These are REAL footprints. Every polygon in the output is the actual outline
 * of an actual building on or near South Figueroa Street, with its real height
 * where OSM records one. The Financial District towers either side of Figueroa
 * are the tallest in the western United States, which is exactly why this
 * corridor was chosen: the street is hemmed in by them, and that enclosure is
 * part of why its traffic behaves the way it does.
 *
 * Fetch the input with:
 *
 *   curl -G https://overpass-api.de/api/interpreter \
 *     -A "your-project/1.0" \
 *     --data-urlencode 'data=[out:json][timeout:120];way["building"](34.0425,-118.2672,34.0558,-118.2532);out tags geom;' \
 *     -o osm-buildings.json
 *
 * then run:  node scripts/build-buildings.mjs osm-buildings.json
 */

import { readFileSync, writeFileSync } from 'node:fs';

// Origin of the local metre grid: the middle of the study corridor,
// Figueroa at about 7th Street.
const ORIGIN = { lat: 34.049, lon: -118.2585 };

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

/** Project lat/lon to local metres. +x is east, -z is north. */
function project(lat, lon) {
  return [
    (lon - ORIGIN.lon) * M_PER_DEG_LON,
    -(lat - ORIGIN.lat) * M_PER_DEG_LAT,
  ];
}

/** Parse an OSM height tag: "123", "123 m", "123.5". Returns metres or null. */
function parseHeight(v) {
  if (!v) return null;
  const m = String(v).match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 && n < 600 ? n : null;
}

/**
 * Height for one building, in descending order of trust:
 *   1. an explicit height tag
 *   2. building:levels x 3.6 m, the typical commercial floor-to-floor in DTLA
 *   3. a default by building type
 */
function heightFor(tags) {
  const explicit = parseHeight(tags.height) ?? parseHeight(tags['building:height']);
  if (explicit) return explicit;

  const levels =
    parseHeight(tags['building:levels']) ?? parseHeight(tags['levels']);
  if (levels) return Math.max(4, levels * 3.6);

  const est = parseHeight(tags.est_height);
  if (est) return est;

  const type = tags.building;
  if (type === 'garage' || type === 'parking') return 14;
  if (type === 'retail' || type === 'commercial') return 12;
  if (type === 'church' || type === 'cathedral') return 22;
  if (type === 'roof' || type === 'canopy') return 5;
  return 9; // a plain two-to-three storey block
}

/** Shoelace area of a projected ring, in square metres. */
function area(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}

/** Drop vertices that sit on a straight line between their neighbours. */
function simplify(ring, tolerance = 0.6) {
  if (ring.length < 5) return ring;
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[(i - 1 + ring.length) % ring.length];
    const c = ring[i];
    const n = ring[(i + 1) % ring.length];
    // perpendicular distance of c from the line p->n
    const dx = n[0] - p[0];
    const dz = n[1] - p[1];
    const len = Math.hypot(dx, dz);
    const d =
      len < 1e-6
        ? Math.hypot(c[0] - p[0], c[1] - p[1])
        : Math.abs(dx * (p[1] - c[1]) - (p[0] - c[0]) * dz) / len;
    if (d > tolerance) out.push(c);
  }
  return out.length >= 3 ? out : ring;
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('usage: node scripts/build-buildings.mjs <osm-buildings.json>');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(inputPath, 'utf8'));
const elements = raw.elements ?? [];

const buildings = [];
let skippedTiny = 0;

for (const el of elements) {
  if (!el.geometry || el.geometry.length < 4) continue;
  const tags = el.tags ?? {};

  let ring = el.geometry.map((g) => project(g.lat, g.lon));
  // OSM closes the ring by repeating the first node
  if (
    ring.length > 1 &&
    Math.abs(ring[0][0] - ring[ring.length - 1][0]) < 1e-6 &&
    Math.abs(ring[0][1] - ring[ring.length - 1][1]) < 1e-6
  ) {
    ring.pop();
  }
  if (ring.length < 3) continue;

  const footprint = area(ring);
  if (footprint < 45) {
    skippedTiny++;
    continue; // sheds, kiosks, map noise
  }

  ring = simplify(ring);
  if (ring.length > 48) ring = ring.filter((_, i) => i % 2 === 0);

  const height = heightFor(tags);
  const entry = {
    h: Math.round(height * 10) / 10,
    p: ring.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]),
  };
  // Keep the name only for buildings tall enough to be worth labelling,
  // so the file does not carry a string for every parking structure.
  if (tags.name && height >= 90) entry.n = tags.name;
  buildings.push(entry);
}

buildings.sort((a, b) => b.h - a.h);

const out = {
  note: 'Real OpenStreetMap building footprints, downtown Los Angeles. Projected to metres about the origin below. Generated by scripts/build-buildings.mjs — do not edit by hand.',
  origin: ORIGIN,
  generated: new Date().toISOString().slice(0, 10),
  count: buildings.length,
  buildings,
};

writeFileSync('src/data/buildings.json', JSON.stringify(out));

const named = buildings.filter((b) => b.n);
console.log(`buildings kept : ${buildings.length}`);
console.log(`skipped (tiny) : ${skippedTiny}`);
console.log(`tallest        : ${buildings[0]?.h} m`);
console.log(`named (>=90 m) : ${named.length}`);
for (const b of named.slice(0, 14)) console.log(`   ${String(b.h).padStart(6)} m  ${b.n}`);
