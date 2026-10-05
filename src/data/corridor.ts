/**
 * corridor.ts
 * ---------------------------------------------------------------------------
 * The study site: Interstate 405 southbound, through the Sepulveda Pass.
 *
 * From the US-101 interchange in Sherman Oaks, over the Santa Monica
 * Mountains, down to Wilshire Boulevard in Westwood — about 7 miles.
 *
 * This is the most congested stretch of freeway in the United States, and it
 * is the stretch Los Angeles spent $1.6 billion widening between 2009 and
 * 2014. Afterwards, peak travel times got slightly WORSE. Section 2 of the
 * site explains why that outcome is predicted by the geometry rather than
 * being a surprise.
 *
 * Each point is a real interchange, so the measurement stations the traffic
 * API returns can be anchored to places a person can actually picture.
 */

export interface CorridorPoint {
  /** short label shown on the map and axis */
  name: string;
  lat: number;
  lon: number;
  /** cumulative distance from the north end, metres (computed below) */
  offset: number;
}

/** Number of through lanes (excluding the HOV lane) at each point. */
export interface CorridorSegment {
  from: string;
  to: string;
  lanes: number;
  /** length in metres */
  length: number;
  /** a note explaining the geometry of this segment */
  note: string;
}

const RAW: Array<Omit<CorridorPoint, 'offset'>> = [
  { name: 'US-101',        lat: 34.1595, lon: -118.4675 },
  { name: 'Ventura Blvd',  lat: 34.1540, lon: -118.4690 },
  { name: 'Valley Vista',  lat: 34.1460, lon: -118.4725 },
  { name: 'Mulholland Dr', lat: 34.1310, lon: -118.4780 },
  { name: 'Skirball Ctr',  lat: 34.1140, lon: -118.4780 },
  { name: 'Getty Center',  lat: 34.0885, lon: -118.4745 },
  { name: 'Moraga Dr',     lat: 34.0800, lon: -118.4740 },
  { name: 'Sunset Blvd',   lat: 34.0735, lon: -118.4715 },
  { name: 'Montana Ave',   lat: 34.0640, lon: -118.4700 },
  { name: 'Wilshire Blvd', lat: 34.0570, lon: -118.4690 },
];

/** Great-circle distance between two lat/lon points, in metres. */
export function haversine(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371008.8; // mean Earth radius, m
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The corridor, with cumulative offsets filled in. */
export const CORRIDOR: CorridorPoint[] = (() => {
  let acc = 0;
  return RAW.map((p, i) => {
    if (i > 0) acc += haversine(RAW[i - 1], p);
    return { ...p, offset: acc };
  });
})();

/** Total corridor length, metres. */
export const CORRIDOR_LENGTH = CORRIDOR[CORRIDOR.length - 1].offset;

/**
 * Lane counts, southbound, as built after the 2014 widening project.
 * The pass itself narrows — that narrowing is the bottleneck, and the
 * bottleneck is where the jam is born.
 */
export const SEGMENTS: CorridorSegment[] = (() => {
  const spec: Array<[string, string, number, string]> = [
    ['US-101', 'Ventura Blvd', 5, 'Merge from the 101 adds a full freeway worth of demand in under a mile.'],
    ['Ventura Blvd', 'Valley Vista', 5, 'Last flat section before the climb.'],
    ['Valley Vista', 'Mulholland Dr', 4, 'The climb begins; a lane drops. Capacity falls by a fifth here.'],
    ['Mulholland Dr', 'Skirball Ctr', 4, 'Steepest grade. Heavy vehicles lose speed, forcing lane changes.'],
    ['Skirball Ctr', 'Getty Center', 4, 'Crest of the pass — the geometric bottleneck of the whole corridor.'],
    ['Getty Center', 'Moraga Dr', 5, 'Descending; a lane returns, but the queue upstream has already formed.'],
    ['Moraga Dr', 'Sunset Blvd', 5, 'Sunset on-ramp injects demand into a recovering stream.'],
    ['Sunset Blvd', 'Montana Ave', 5, 'Flat, straight, and the fastest section on a good day.'],
    ['Montana Ave', 'Wilshire Blvd', 5, 'Approach to the Wilshire interchange and the Westwood off-ramps.'],
  ];
  return spec.map(([from, to, lanes, note]) => {
    const a = CORRIDOR.find((p) => p.name === from)!;
    const b = CORRIDOR.find((p) => p.name === to)!;
    return { from, to, lanes, length: b.offset - a.offset, note };
  });
})();

/** The bottleneck segment — where capacity is lowest. */
export const BOTTLENECK = 'Skirball Ctr';

/**
 * Bounding box for the TomTom Flow Segment queries: we sample the API at each
 * corridor point rather than requesting one average for the whole stretch,
 * because a single average would hide exactly the thing we are looking for —
 * the DIFFERENCE between neighbouring sections, which is what makes a wave.
 */
export const CORRIDOR_BBOX = {
  minLat: Math.min(...RAW.map((p) => p.lat)),
  maxLat: Math.max(...RAW.map((p) => p.lat)),
  minLon: Math.min(...RAW.map((p) => p.lon)),
  maxLon: Math.max(...RAW.map((p) => p.lon)),
};
