/**
 * corridor.ts
 * ---------------------------------------------------------------------------
 * The study site: South Figueroa Street, downtown Los Angeles.
 *
 * Southbound from 3rd Street, through the Financial District, past Wilshire
 * and 7th, down to 11th. Just over a mile.
 *
 * WHY THIS STREET
 *
 * Figueroa runs at the foot of the tallest buildings in the western United
 * States — the Wilshire Grand at 335 m and the US Bank Tower at 310 m are both
 * on it, and the 3D scene renders their real footprints. All of that floor
 * space empties onto this street twice a day, through ten signalised
 * intersections in a single mile.
 *
 * It is also the better street for the mathematics. On a freeway you have to
 * wait for a jam to happen. Here one is manufactured every ninety seconds by a
 * red light, which means the backward wave the whole project is about can be
 * watched on demand instead of hoped for.
 *
 * WHERE THE GEOMETRY COMES FROM
 *
 * The centreline is the real OpenStreetMap geometry of South Figueroa Street
 * (see scripts/build-street.mjs), not an estimate. The first version of this
 * file used hand-placed intersection coordinates and they were out by up to
 * 85 m, which does not sound like much until the roadway is running through
 * the lobby of the Wilshire Grand. Since the buildings are real OSM data, the
 * street has to be too.
 *
 * The named intersections below are then SNAPPED onto that centreline by
 * latitude, so their positions are the street's own, not mine.
 */

import { project, measure, type LatLon, type PolyPoint } from '../lib/geo';
import streetData from './street.json';

/** The real centreline, north to south, as [lat, lon] pairs. */
const STREET_POINTS = streetData.points as Array<[number, number]>;

/** The centreline in local metres, with cumulative arc length. */
export const CENTERLINE: PolyPoint[] = measure(
  STREET_POINTS.map(([lat, lon]) => project(lat, lon)),
);

export const CORRIDOR_LENGTH = CENTERLINE[CENTERLINE.length - 1].s;

export interface CorridorPoint extends LatLon {
  /** cross street name */
  name: string;
  /** distance from the north end along the real street, metres */
  offset: number;
  /** signal cycle length, seconds */
  cycle: number;
  /** fraction of the cycle that is green for Figueroa */
  greenSplit: number;
  /** offset into the cycle when this signal turns green, seconds */
  phase: number;
  note: string;
}

/**
 * The intersections. Latitudes are the anchor — Figueroa is monotonic in
 * latitude over this stretch, so each cross street is placed by finding the
 * point on the real centreline at that latitude. Longitude and arc position
 * then come from the street itself.
 *
 * Signal timing is modelled on LADOT's downtown grid: 90-second cycles on an
 * offset progression intended to give southbound traffic a green wave.
 */
const SPEC: Array<{
  name: string;
  lat: number;
  cycle: number;
  greenSplit: number;
  phase: number;
  note: string;
}> = [
  { name: 'W 3rd St',      lat: 34.0551, cycle: 90, greenSplit: 0.52, phase: 0,  note: 'Top of the corridor, below the Bunker Hill towers.' },
  { name: 'W 4th St',      lat: 34.0538, cycle: 90, greenSplit: 0.50, phase: 8,  note: 'Harbor Freeway ramps pull a lane of traffic out here.' },
  { name: 'W 5th St',      lat: 34.0524, cycle: 90, greenSplit: 0.48, phase: 16, note: 'The US Bank Tower stands over the east side of this block.' },
  { name: 'W 6th St',      lat: 34.0510, cycle: 90, greenSplit: 0.48, phase: 24, note: 'Gas Company Tower and 777 Tower either side.' },
  { name: 'Wilshire Blvd', lat: 34.0500, cycle: 90, greenSplit: 0.42, phase: 30, note: 'The Wilshire Grand, tallest in the west. Shortest green on the corridor.' },
  { name: 'W 7th St',      lat: 34.0488, cycle: 90, greenSplit: 0.44, phase: 38, note: 'Busiest pedestrian crossing downtown; the metro station is beneath it.' },
  { name: 'W 8th St',      lat: 34.0475, cycle: 90, greenSplit: 0.50, phase: 46, note: 'Approach to the convention district.' },
  { name: 'W 9th St',      lat: 34.0461, cycle: 90, greenSplit: 0.50, phase: 54, note: 'Oceanwide Plaza on the west side.' },
  { name: 'Olympic Blvd',  lat: 34.0447, cycle: 90, greenSplit: 0.40, phase: 62, note: 'Arena traffic merges here. The corridor bottleneck.' },
  { name: 'W 11th St',     lat: 34.0437, cycle: 90, greenSplit: 0.52, phase: 70, note: 'Bottom of the study corridor.' },
];

/** Snap a latitude onto the real centreline, returning its index. */
function indexAtLatitude(lat: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < STREET_POINTS.length; i++) {
    const d = Math.abs(STREET_POINTS[i][0] - lat);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export const CORRIDOR: CorridorPoint[] = SPEC.map((spec) => {
  const i = indexAtLatitude(spec.lat);
  const [lat, lon] = STREET_POINTS[i];
  return {
    name: spec.name,
    lat,
    lon,
    offset: CENTERLINE[i].s,
    cycle: spec.cycle,
    greenSplit: spec.greenSplit,
    phase: spec.phase,
    note: spec.note,
  };
});

/**
 * Through lanes southbound, block by block.
 *
 * OSM tags this street at 4 to 7 lanes, but those counts include turn pockets
 * and the parking lane. The numbers here are the THROUGH lanes a driver can
 * actually keep moving in, which is what the capacity arithmetic needs.
 */
export interface CorridorSegment {
  from: string;
  to: string;
  lanes: number;
  length: number;
  note: string;
}

export const SEGMENTS: CorridorSegment[] = (() => {
  const spec: Array<[string, string, number, string]> = [
    ['W 3rd St', 'W 4th St', 4, 'Four through lanes leaving Bunker Hill.'],
    ['W 4th St', 'W 5th St', 4, 'Freeway ramps bleed off a lane of demand.'],
    ['W 5th St', 'W 6th St', 4, 'The Financial District core.'],
    ['W 6th St', 'Wilshire Blvd', 4, 'Approach to the shortest green on the street.'],
    ['Wilshire Blvd', 'W 7th St', 3, 'A lane is lost to the bus stop and turn pocket.'],
    ['W 7th St', 'W 8th St', 3, 'Heaviest pedestrian interference of the corridor.'],
    ['W 8th St', 'W 9th St', 3, 'Recovering, but the queue from Olympic reaches back to here.'],
    ['W 9th St', 'Olympic Blvd', 3, 'The bottleneck approach.'],
    ['Olympic Blvd', 'W 11th St', 4, 'Opens out again past the arena turn.'],
  ];
  return spec.map(([from, to, lanes, note]) => {
    const a = CORRIDOR.find((p) => p.name === from)!;
    const b = CORRIDOR.find((p) => p.name === to)!;
    return { from, to, lanes, length: b.offset - a.offset, note };
  });
})();

/** Where capacity is lowest — the signal that sets the corridor's throughput. */
export const BOTTLENECK = 'Olympic Blvd';

/** Lane count used by the simulation. */
export const LANES = 3;

export const CORRIDOR_NAME = 'S Figueroa St';
export const CORRIDOR_SUBTITLE = 'Downtown Los Angeles · 3rd to 11th';
